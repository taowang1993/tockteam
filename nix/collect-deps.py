"""Collect a package's transitive npm dependency graph from a pnpm store.

Each pnpm package is copied once into a private store. Package-local symlinks
preserve pnpm's exact graph, including incompatible versions.

Usage: collect-deps.py <pnpmStoreDir> <packageJsonPath> <outDir>
"""

import hashlib
import json
import os
import re
import shutil
import sys

EXACT_VERSION = re.compile(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?")
CLOSURE_DIR = ".tockteam-pnpm-closure"


def dependency_specs(manifest):
    specs = {}
    for key in ("dependencies", "optionalDependencies", "peerDependencies"):
        for name, spec in manifest.get(key, {}).items():
            specs.setdefault(name, spec)
    return specs


def package_version(package_dir):
    try:
        with open(os.path.join(package_dir, "package.json")) as f:
            return json.load(f).get("version")
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def is_store_package(store_dir, package_dir):
    try:
        return os.path.commonpath((os.path.realpath(store_dir), os.path.realpath(package_dir))) == os.path.realpath(store_dir)
    except ValueError:
        return False


def resolve_installed(package_dir, name):
    """Follow pnpm's package-local links to the version it actually resolved."""
    current = os.path.abspath(package_dir)
    while True:
        candidate = os.path.join(current, "node_modules", *name.split("/"))
        if os.path.isdir(candidate):
            return os.path.realpath(candidate)
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def find_package(store_dir, issuer_dir, name, spec):
    """Use pnpm's installed resolution, falling back to an exact store match."""
    installed = resolve_installed(issuer_dir, name)
    if installed and is_store_package(store_dir, installed) and (
        not EXACT_VERSION.fullmatch(spec) or package_version(installed) == spec
    ):
        return installed
    if not EXACT_VERSION.fullmatch(spec):
        return None

    prefix = name.replace("/", "+") + "@"
    for entry in sorted(os.listdir(store_dir)):
        candidate = os.path.join(store_dir, entry, "node_modules", name)
        if (
            entry.startswith(prefix)
            and os.path.isdir(candidate)
            and is_store_package(store_dir, candidate)
            and package_version(candidate) == spec
        ):
            return candidate
    return None


def stored_path(store_dir, closure_dir, source):
    relative = os.path.relpath(os.path.realpath(source), os.path.realpath(store_dir))
    key = hashlib.sha256(relative.encode()).hexdigest()[:20]
    return os.path.join(closure_dir, key)


def install_source(store_dir, closure_dir, source):
    destination = stored_path(store_dir, closure_dir, source)
    if os.path.isdir(destination):
        return destination

    shutil.copytree(source, destination, symlinks=False, ignore=shutil.ignore_patterns("node_modules"))
    with open(os.path.join(destination, "package.json")) as f:
        manifest = json.load(f)

    dependencies = dependency_specs(manifest)
    if dependencies:
        modules = os.path.join(destination, "node_modules")
        os.makedirs(modules)
        for name, spec in dependencies.items():
            dependency = find_package(store_dir, source, name, spec)
            if dependency is None or not os.path.isdir(dependency):
                continue
            target = install_source(store_dir, closure_dir, dependency)
            link = os.path.join(modules, *name.split("/"))
            os.makedirs(os.path.dirname(link), exist_ok=True)
            os.symlink(os.path.relpath(target, os.path.dirname(link)), link)

    print(f"collected {manifest.get('name')}@{manifest.get('version')}")
    return destination


def collect_dependency(store_dir, closure_dir, issuer_dir, out_dir, name, spec):
    source = find_package(store_dir, issuer_dir, name, spec)
    if source is None or not os.path.isdir(source):
        return

    link = os.path.join(out_dir, *name.split("/"))
    os.makedirs(os.path.dirname(link), exist_ok=True)
    if os.path.lexists(link):
        if package_version(link) == package_version(source):
            return
        raise RuntimeError(f"conflicting top-level dependency versions for {name}")

    target = install_source(store_dir, closure_dir, source)
    os.symlink(os.path.relpath(target, os.path.dirname(link)), link)


def main():
    store_dir, package_json, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(package_json) as f:
        manifest = json.load(f)

    os.makedirs(out_dir, exist_ok=True)
    closure_dir = os.path.join(out_dir, CLOSURE_DIR)
    os.makedirs(closure_dir, exist_ok=True)
    issuer_dir = os.path.dirname(package_json)
    for name, spec in dependency_specs(manifest).items():
        collect_dependency(store_dir, closure_dir, issuer_dir, out_dir, name, spec)


if __name__ == "__main__":
    main()

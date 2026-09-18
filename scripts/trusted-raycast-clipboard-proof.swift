import AppKit
import Foundation

typealias ClipboardSnapshot = [[String: Data]]
enum ProofError: Error { case rejected }
protocol ProofBoard: AnyObject {
  var changeCount: Int { get }
  func capture() throws -> ClipboardSnapshot
  func write(_ text: String) throws
  func matches(_ text: String) -> Bool
  func restore(_ snapshot: ClipboardSnapshot) throws
}

// Verification-only owner: capture, lease admission, write and restoration share one serial process.
// There is no cross-process liveness check followed by an unprotected Electron write.
final class CopyOwner {
  let board: ProofBoard
  let now: () -> TimeInterval
  var original: ClipboardSnapshot?
  var originalCount = 0
  var identity = ""
  var text = ""
  var deadline: TimeInterval = 0
  var live = false
  var used = false
  init(_ board: ProofBoard, now: @escaping () -> TimeInterval) { self.board = board; self.now = now }
  func arm(_ identity: String, _ text: String) throws {
    guard !live && !used && !identity.isEmpty && identity.utf8.count <= 128 && text.utf8.count <= 131072 else { throw ProofError.rejected }
    let count = board.changeCount
    let snapshot = try board.capture()
    let size = snapshot.reduce(0) { total, item in total + item.reduce(0) { $0 + $1.key.utf8.count + $1.value.count } }
    guard size <= 16 * 1024 * 1024 && board.changeCount == count else { throw ProofError.rejected }
    self.original = snapshot; self.originalCount = count; self.identity = identity; self.text = text
    self.deadline = now() + 5; self.live = true
  }
  func close() { live = false; original = nil; text = "" }
  func copy(_ identity: String) -> (Bool, String) {
    guard live && !used && identity == self.identity, let original else { return (false, "REVOKED") }
    guard now() < deadline else { close(); return (false, "EXPIRED") }
    used = true
    guard board.changeCount == originalCount else { close(); return (false, "EXTERNAL_CHANGE_PRESERVED") }
    var ownedCount: Int?
    var succeeded = false
    var restoration = "UNCHANGED"
    // Every post-write error attempts guarded restoration before acknowledging a result.
    do {
      defer {
        if let count = ownedCount {
          if board.changeCount == count {
            do { try board.restore(original); restoration = "RESTORED" }
            catch { succeeded = false; restoration = "RESTORE_FAILED" }
          } else { restoration = "EXTERNAL_CHANGE_PRESERVED" }
        }
        close()
      }
      do {
        try board.write(text)
        ownedCount = board.changeCount
        succeeded = board.matches(text)
      } catch {
        // Native write can change the board before reporting failure.
        if board.changeCount != originalCount { ownedCount = board.changeCount }
      }
    }
    return (succeeded, restoration)
  }
}

final class NativeBoard: ProofBoard {
  let board = NSPasteboard.general
  var changeCount: Int { board.changeCount }
  func capture() throws -> ClipboardSnapshot {
    var snapshot: ClipboardSnapshot = []; var bytes = 0
    for item in board.pasteboardItems ?? [] {
      var saved: [String: Data] = [:]
      for type in item.types {
        guard let data = item.data(forType: type) else { throw ProofError.rejected }
        bytes += type.rawValue.utf8.count + data.count
        guard bytes <= 16 * 1024 * 1024 else { throw ProofError.rejected }
        saved[type.rawValue] = data
      }
      snapshot.append(saved)
    }
    return snapshot
  }
  func write(_ text: String) throws {
    board.clearContents()
    guard board.setString(text, forType: .string) else { throw ProofError.rejected }
  }
  func matches(_ text: String) -> Bool { board.string(forType: .string) == text }
  func restore(_ snapshot: ClipboardSnapshot) throws {
    let items = try snapshot.map { saved -> NSPasteboardItem in
      let item = NSPasteboardItem()
      for (type, data) in saved { guard item.setData(data, forType: NSPasteboard.PasteboardType(type)) else { throw ProofError.rejected } }
      return item
    }
    board.clearContents()
    guard items.isEmpty || board.writeObjects(items) else { throw ProofError.rejected }
  }
}

func selfTest() throws {
  final class FakeBoard: ProofBoard {
    var changeCount = 0; var writes = 0; var restores = 0; var failWrite = false; var failRead = false; var external = false; var oversized = false
    func capture() throws -> ClipboardSnapshot { [["format": Data(repeating: 1, count: oversized ? 16 * 1024 * 1024 + 1 : 3)]] }
    func write(_ text: String) throws { writes += 1; changeCount += 1; if failWrite { throw ProofError.rejected } }
    func matches(_ text: String) -> Bool { if external { changeCount += 1 }; return !failRead }
    func restore(_ snapshot: ClipboardSnapshot) throws { restores += 1; changeCount += 1 }
  }
  for delay in [5.0, 6.0, 120.0] {
    var clock = 0.0; let board = FakeBoard(); let owner = CopyOwner(board, now: { clock })
    try owner.arm("id", "controlled"); clock = delay
    precondition(!owner.copy("id").0 && board.writes == 0, "delayed/expired Copy wrote after lease")
  }
  let exitedBoard = FakeBoard(); let exited = CopyOwner(exitedBoard, now: { 0 })
  try exited.arm("id", "controlled"); exited.close()
  precondition(!exited.copy("id").0 && exitedBoard.writes == 0, "exited owner wrote")
  let board = FakeBoard(); let owner = CopyOwner(board, now: { 0 })
  try owner.arm("id", "controlled")
  precondition(!owner.copy("foreign").0 && board.writes == 0)
  precondition(owner.copy("id").0 && board.restores == 1)
  precondition(!owner.copy("id").0 && board.writes == 1, "replay wrote")
  for failure in ["write", "read", "external"] {
    let board = FakeBoard(); board.failWrite = failure == "write"; board.failRead = failure == "read"; board.external = failure == "external"
    let owner = CopyOwner(board, now: { 0 }); try owner.arm("id", "controlled")
    let result = owner.copy("id")
    if failure == "external" { precondition(result.1 == "EXTERNAL_CHANGE_PRESERVED" && board.restores == 0) }
    else { precondition(!result.0 && board.restores == 1, "post-write error did not restore") }
  }
  let large = FakeBoard(); large.oversized = true; let bounded = CopyOwner(large, now: { 0 })
  do { try bounded.arm("id", "controlled"); preconditionFailure("oversized clipboard captured") } catch {}
  precondition(large.writes == 0)
  print("SELF_TEST_OK delayed expiry exit replay restoration failure external change")
}

if CommandLine.arguments.contains("--self-test") {
  try selfTest()
} else {
  func emit(_ text: String) { print(text); fflush(stdout) }
  let owner = CopyOwner(NativeBoard(), now: { ProcessInfo.processInfo.systemUptime })
  let lock = NSLock(); var commands: [String] = []
  // Termination requests are serialized behind any write/restoration already in progress.
  signal(SIGTERM, SIG_IGN)
  let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
  termination.setEventHandler { lock.lock(); commands.append("CLOSE"); lock.unlock() }
  termination.resume()
  DispatchQueue.global().async {
    while let line = readLine() {
      lock.lock(); if commands.count < 4 && line.utf8.count <= 180000 { commands.append(line) } else { commands = ["CLOSE"] }; lock.unlock()
    }
    lock.lock(); commands.append("CLOSE"); lock.unlock()
  }
  let startupDeadline = ProcessInfo.processInfo.systemUptime + 5
  var done = false
  while !done {
    lock.lock(); let pending = commands; commands.removeAll(); lock.unlock()
    for line in pending {
      let fields = line.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
      if fields.count == 3 && fields[0] == "ARM", let data = Data(base64Encoded: fields[2]), let text = String(data: data, encoding: .utf8) {
        do { try owner.arm(fields[1], text); emit("ARMED \(fields[1])") }
        catch { emit("REJECTED"); done = true }
      } else if fields.count == 2 && fields[0] == "COPY" {
        let result = owner.copy(fields[1]); emit("RESULT \(fields[1]) \(result.0 ? "true" : "false") \(result.1)"); done = true
      } else { done = true }
      if done { break }
    }
    let now = ProcessInfo.processInfo.systemUptime
    if now >= (owner.live ? owner.deadline : startupDeadline) { done = true }
    if !done { Thread.sleep(forTimeInterval: 0.005) }
  }
  owner.close()
}

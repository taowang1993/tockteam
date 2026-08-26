import assert from 'node:assert/strict'
import test from 'node:test'
import { appendAttachmentMarkdown, attachmentTargetPath } from '../dist/attachments.js'

test('allocates collision-safe attachment targets and preserves Markdown bytes', () => {
  assert.equal(attachmentTargetPath('Attachments', 'lesson image.png', new Set(['Attachments/lesson image.png'])), 'Attachments/lesson image 2.png')
  assert.equal(appendAttachmentMarkdown('Body  \n', '![[Attachments/image.png]]'), 'Body  \n\n![[Attachments/image.png]]\n')
  assert.equal(appendAttachmentMarkdown('Body\t', '![[Attachments/audio.wav]]'), 'Body\t\n\n![[Attachments/audio.wav]]\n')
})

test('rejects unsafe names, paths, and unsupported attachment types', () => {
  assert.throws(() => attachmentTargetPath('../escape', 'image.png', new Set()), /folder/u)
  assert.throws(() => attachmentTargetPath('Attachments', '../image.png', new Set()), /name/u)
  assert.throws(() => attachmentTargetPath('Attachments', 'script.js', new Set()), /type/u)
})

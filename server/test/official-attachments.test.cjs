const { test } = require('node:test');
const assert = require('node:assert/strict');
const { attachmentMimeType, MAX_ATTACHMENT_SIZE } = require('../src/attachments/attachment-files');
const { AttachmentsController } = require('../src/attachments/attachments.controller');
const { OFFICIAL_FILE_ACCEPT, officialFileError, canPreviewAttachment, attachmentTypeLabel } = require('../../client/src/lib/officialAttachments');

const formats = [
  ['pdf', 'application/pdf', 'PDF'],
  ['doc', 'application/msword', 'Word'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word'],
  ['xls', 'application/vnd.ms-excel', 'Excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel'],
  ['jpg', 'image/jpeg', 'صورة'], ['jpeg', 'image/jpeg', 'صورة'],
  ['png', 'image/png', 'صورة'], ['webp', 'image/webp', 'صورة'],
];

test('official file selection and every upload category support PDF, Word, Excel and images', () => {
  assert.deepEqual(OFFICIAL_FILE_ACCEPT.split(',').sort(), formats.map(([ext]) => '.' + ext).sort());
  for (const [extension, mime, label] of formats) {
    const name = `تقرير رسمي.${extension.toUpperCase()}`;
    assert.equal(officialFileError({ name, size: MAX_ATTACHMENT_SIZE }), null);
    assert.equal(attachmentTypeLabel(mime), label);
    for (const category of [undefined, 'GENERAL', 'DAILY_SUMMARY', 'EXECUTIVE_TASK', 'TASK_COMPLETION', 'ANNOUNCEMENT', 'TODO']) {
      // Some browsers send Office files with a generic or missing MIME type.
      for (const mimetype of ['', 'application/octet-stream', mime]) {
        assert.equal(attachmentMimeType({ originalname: name, mimetype }, category), mime);
      }
    }
  }
});

test('official uploads reject unsupported extensions even when the supplied MIME type is PDF', () => {
  for (const name of ['report.pdf.exe', 'script.html', 'icon.svg', 'archive.zip', 'slides.pptx', 'notes.txt', 'no-extension']) {
    assert.ok(officialFileError({ name, size: 100 }));
    assert.throws(() => attachmentMimeType({ originalname: name, mimetype: 'application/pdf' }, 'DAILY_SUMMARY'));
  }
  assert.ok(officialFileError({ name: 'report.xlsx', size: 0 }));
  assert.ok(officialFileError({ name: 'report.docx', size: MAX_ATTACHMENT_SIZE + 1 }));
});

test('PDF and images preview inline; Word and Excel download with their original filename', async () => {
  for (const [extension, mimeType] of formats) {
    const attachment = { id: 'test', fileName: `تقرير.${extension}`, mimeType };
    const absolutePath = '/uploads/test.' + extension;
    const controller = new AttachmentsController({ getAttachmentById: async () => ({ attachment, absolutePath }) });
    for (const download of [undefined, '1']) {
      const headers = {};
      let result;
      const response = {
        setHeader: (name, value) => { headers[name] = value; },
        download: (filePath, fileName) => { result = { filePath, fileName, mode: 'download' }; },
        sendFile: (filePath) => { result = { filePath, mode: 'inline' }; },
      };
      await controller.downloadAttachment({ user: { id: 'user' } }, 'test', download, response);
      const preview = mimeType === 'application/pdf' || mimeType.startsWith('image/');
      assert.equal(canPreviewAttachment(mimeType), preview);
      assert.equal(result.filePath, absolutePath);
      assert.equal(result.mode, preview && !download ? 'inline' : 'download');
      if (result.mode === 'download') assert.equal(result.fileName, attachment.fileName);
      else assert.equal(headers['Content-Type'], mimeType);
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    }
  }
});

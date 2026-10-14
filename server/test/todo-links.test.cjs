const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preserveTodoSystemTags } = require('../../client/src/lib/todoLinks');

test('editing agenda text preserves all linked plan copies and assignment IDs', () => {
  const tags = [
    '[تم إدراجها في الخطة اليومية بتاريخ: 2026-09-17]',
    '[معرف المهمة: original-plan-task]',
    '[معرف المهمة: carried-plan-task]',
    '[معرف المهمة: newest-plan-task]',
    '[تم تحويلها إلى تكليف تنفيذي رسمي]',
    '[معرف التكليف: first-assignment]',
    '[معرف التكليف: second-assignment]',
    '[معرف المفكرة: agenda-item]',
  ];
  const original = ['وصف سابق', ...tags].join('\n');
  assert.equal(preserveTodoSystemTags('  وصف معدّل  ', original), ['وصف معدّل', ...tags].join('\n'));
  assert.equal(preserveTodoSystemTags('', original), tags.join('\n'));
});

test('preservation retains the exact conversion marker rather than inventing metadata from prose', () => {
  for (const tag of [
    '[تم تحويلها إلى الخطة اليومية الصباحية]',
    '[تم إدراجها في الخطة اليومية]',
    '[تم إسنادها كتكليف تنفيذي]',
  ]) {
    assert.equal(preserveTodoSystemTags('جديد', `سابق\n${tag}`), `جديد\n${tag}`);
  }
  assert.equal(preserveTodoSystemTags('جديد', 'مناقشة الخطة اليومية وتكليف تنفيذي'), 'جديد');
  assert.equal(preserveTodoSystemTags('جديد', '[ملاحظة شخصية]'), 'جديد');
});

test('editing a todo without system links still saves trimmed user text', () => {
  assert.equal(preserveTodoSystemTags('  تفاصيل  '), 'تفاصيل');
  assert.equal(preserveTodoSystemTags('', null), '');
  assert.equal(preserveTodoSystemTags('  ', ''), '');
});

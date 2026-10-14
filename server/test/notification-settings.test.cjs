const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('notification settings opens the registered Android bridge and preserves failures for user guidance', async () => {
  let platform = 'android', calls = 0, failure = null;
  const source = fs.readFileSync(path.resolve(__dirname, '../../client/src/lib/notificationSettings.ts'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module, exports: module.exports,
    require: (name) => {
      assert.equal(name, '@capacitor/core');
      return {
        Capacitor: { getPlatform: () => platform },
        registerPlugin: (plugin) => {
          assert.equal(plugin, 'PortsNotificationSettings');
          return { open: async () => { calls++; if (failure) throw failure; } };
        },
      };
    },
  });
  await module.exports.openNotificationSettings();
  assert.equal(calls, 1);
  failure = new Error('Older APK has no bridge');
  await assert.rejects(module.exports.openNotificationSettings(), failure);
  platform = 'web';
  await assert.rejects(module.exports.openNotificationSettings(), /unavailable/);
  assert.equal(calls, 2, 'Browser must not invoke native Android settings');
});

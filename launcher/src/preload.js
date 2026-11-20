const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = ch => cb => {
  const fn = (_e, d) => cb(d);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('api', {
  win: {
    min: () => ipcRenderer.send('win:min'),
    max: () => ipcRenderer.send('win:max'),
    close: () => ipcRenderer.send('win:close')
  },
  info: () => inv('app:info'),
  openDir: () => inv('app:openDir'),
  openSub: sub => inv('app:openSub', sub),
  openUrl: url => inv('app:openUrl', url),
  pickJava: () => inv('app:pickJava'),
  pickDir: () => inv('app:pickDir'),
  checkUpdate: force => inv('app:update', force),
  repair: () => inv('app:repair'),
  settings: {
    get: () => inv('settings:get'),
    set: p => inv('settings:set', p),
    preset: n => inv('settings:preset', n)
  },
  acc: {
    list: () => inv('acc:list'),
    addMicrosoft: () => inv('acc:addMicrosoft'),
    addOffline: n => inv('acc:addOffline', n),
    remove: id => inv('acc:remove', id),
    select: id => inv('acc:select', id)
  },
  versions: s => inv('ver:list', s),
  search: (q, v, type) => inv('mods:search', q, v, type),
  packs: {
    install: (slug, type) => inv('packs:install', slug, type),
    list: () => inv('packs:list'),
    remove: (type, name) => inv('packs:remove', type, name)
  },
  efekt: force => inv('jestron:efekt', force),
  ping: (h, p) => inv('srv:ping', h, p),
  shots: {
    list: () => inv('shots:list'),
    open: id => inv('shots:open', id),
    reveal: id => inv('shots:reveal', id),
    remove: id => inv('shots:delete', id)
  },
  game: {
    launch: o => inv('game:launch', o),
    kill: () => inv('game:kill'),
    running: () => inv('game:running'),
    logs: () => inv('game:logs'),
    lastCrash: () => inv('game:crash'),
    onProgress: on('game:progress'),
    onLogs: on('game:logs'),
    onState: on('game:state'),
    onCrash: on('game:crash')
  }
});

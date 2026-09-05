const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const btnSave = document.getElementById('btn-save');
const btnBleToggle = document.getElementById('btn-ble-toggle');
const bleLinkState = document.getElementById('ble-link-state');
const connState = document.getElementById('conn-state');
const txState = document.getElementById('tx-state');
const eqPresetSel = document.getElementById('system-eq-preset');
const btNameInput = document.getElementById('bt-name');
const bleNameInput = document.getElementById('ble-name');
const kcModeSelect = document.getElementById('kc-mode');
const btnResetDefaults = document.getElementById('btn-reset-defaults');
const chipDevice = document.getElementById('chip-device');
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const btnSidebarClose = document.getElementById('btn-sidebar-close');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const topbarPanelTitle = document.getElementById('topbar-panel-title');
const pwaBar = document.getElementById('pwa-bar');
const btnPwaInstall = document.getElementById('btn-pwa-install');
const btnPwaClose = document.getElementById('btn-pwa-close');
const rxLogBox = document.getElementById('rx-log-box');
const btnLogClear = document.getElementById('btn-log-clear');
const PWA_BAR_CLOSED_KEY = 'pwa_bar_closed';
const BLE_AUTO_RECONNECT_KEY = 'ble_auto_reconnect';
const BLE_DEVICE_ID_KEY = 'ble_device_id';
const BLE_RECONNECT_DELAYS_MS = [0, 1000, 2500, 5000];
// Allow the controller/host stack to finish tearing down the old GATT link
// before attempting a new connection. Immediate reconnects are unreliable on
// some Android/Chrome combinations and can report a false connect failure.
const BLE_RECONNECT_MIN_DELAY_MS = 350;
const DSP_CMD_SAVE_CONFIG = 0x08;
const DSP_CMD_GET_CONFIG = 0x09;
const DSP_CMD_SET_SUB_PHASE = 0x0a;
const DSP_CMD_SET_BT_NAME = 0x0b;
const DSP_CMD_SET_BLE_NAME = 0x0c;
const DSP_CMD_SET_KC_MODE = 0x0d;
const DSP_CMD_RESET_DEFAULTS = 0x0e;
// FF01 uses a single ATT packet: 2-byte header + at most 17 UTF-8 bytes.
const DSP_DEVICE_NAME_MAX_BYTES = 17;
const DSP_EVENT_CONFIG_BEGIN = 0x82;
const DSP_EVENT_CONFIG_ITEM = 0x83;
const DSP_EVENT_CONFIG_END = 0x84;

/* Chế độ firmware dùng 3 biến trở A20/A21/A22 để điều khiển âm lượng.
 * Các slider tương ứng chỉ hiển thị giá trị MCU gửi về, không phát lệnh BLE. */
const ADC_VOLUME_MODE = true;
const ADC_OWNED_CONTROL_IDS = [
  'l-gain', 'r-gain', 'sub-gain', 'mic-output-gain',
  'echo-level', 'rv-level',
];

function applyHardwareVolumeOwnership() {
  ADC_OWNED_CONTROL_IDS.forEach((id) => {
    const control = document.getElementById(id);
    if (!control) return;
    const host = control.closest('label') || control.parentElement;
    control.disabled = ADC_VOLUME_MODE;
    control.setAttribute('aria-disabled', ADC_VOLUME_MODE ? 'true' : 'false');
    control.title = ADC_VOLUME_MODE ? 'Đang điều khiển bằng biến trở trên thiết bị' : '';
    host?.classList.toggle('hardware-owned-control', ADC_VOLUME_MODE);
    if (ADC_VOLUME_MODE && host && !host.querySelector('.hardware-owned-note')) {
      const note = document.createElement('small');
      note.className = 'hardware-owned-note';
      note.textContent = 'Biến trở thiết bị';
      host.appendChild(note);
    }
  });
}

const preampBandChipsL = document.querySelectorAll('#ch-l .band-chip[data-band]');
const preampBandChipsR = document.querySelectorAll('#ch-r .band-chip[data-band]');
const preampBandChipsSub = document.querySelectorAll('#ch-sub .band-chip[data-band]');
const preampBandChipsMic1 = document.querySelectorAll('#mic1-band-chip-row .band-chip[data-band]');
const preampBandChipsMic2 = document.querySelectorAll('#mic2-band-chip-row .band-chip[data-band]');
const preampTableBodyL = document.getElementById('eq-table-body-l');
const preampTableBodyR = document.getElementById('eq-table-body-r');
const preampTableBodySub = document.getElementById('eq-table-body-sub');
const preampTableBodyMic1 = document.getElementById('eq-table-body-mic1');
const preampTableBodyMic2 = document.getElementById('eq-table-body-mic2');
const eqSvgL = document.querySelector('#eq-path-l')?.ownerSVGElement || null;
const eqSvgR = document.querySelector('#eq-path-r')?.ownerSVGElement || null;
const eqSvgSub = document.querySelector('#eq-path-sub')?.ownerSVGElement || null;
const eqSvgMic1 = document.querySelector('#eq-path-mic1')?.ownerSVGElement || null;
const eqSvgMic2 = document.querySelector('#eq-path-mic2')?.ownerSVGElement || null;
const subModeToggle = document.getElementById('sub-mode-toggle');
const subPhaseToggle = document.getElementById('sub-phase-toggle');
const subModeState = document.getElementById('sub-mode-state');
const subPhaseState = document.getElementById('sub-phase-state');
const micAfbToggle = document.getElementById('mic-afb-toggle');
const dynEqToggle = document.getElementById('dyn-eq-toggle');
const drcToggle = document.getElementById('drc-toggle');
const drcCurve = document.getElementById('drc-curve');
const dynamicEqParams = [
  'dyn-low-freq',
  'dyn-high-freq',
  'dyn-low-bass',
  'dyn-low-treble',
  'dyn-high-bass',
  'dyn-high-treble',
  'dyn-th-low',
  'dyn-th-normal',
  'dyn-th-high',
  'dyn-attack',
  'dyn-release',
].map((id) => document.getElementById(id)).filter(Boolean);
const drcParams = [
  'drc-pregain',
  'drc-threshold',
  'drc-ratio',
  'drc-attack',
  'drc-release',
].map((id) => document.getElementById(id)).filter(Boolean);

let connected = false;
let lastTxSignature = '';
let txQueue = Promise.resolve();
let lastPacketError = '';
let deferredInstallPrompt = null;
let pwaBarClosedByUser = localStorage.getItem(PWA_BAR_CLOSED_KEY) === '1';
let bleDevice = null;
let bleServer = null;
let bleConnecting = false;
let bleRxCharacteristic = null;
let bleTxCharacteristic = null;
let bleManualDisconnect = false;
let bleReconnectTimer = null;
let bleReconnectAttempt = 0;
let configSyncResolve = null;
let configSyncTimer = null;
let configSyncExpectedItems = 0;
let configSyncReceivedItems = 0;
let configSyncRevision = 0;
let saveAckTimer = null;
let resetAckTimer = null;
const rxLogLines = [];
const DB_MIN = -12;
const DB_MAX = 12;
const CHART_H = 30;
const EQ_MIN_FREQ = 50;
const EQ_MAX_FREQ_HARD = 20000;
const EQ_DEFAULT_FS = 48000;

const preampBands = [
  { id: 0, active: true, type: 'PK', fc: 80, gain: 0.0, q: 0.707 },
  { id: 1, active: true, type: 'PK', fc: 1000, gain: 0.0, q: 0.707 },
  { id: 2, active: true, type: 'PK', fc: 10000, gain: 0.0, q: 0.707 },
  { id: 3, active: false, type: 'PK', fc: 160, gain: 0.0, q: 0.707 },
  { id: 4, active: false, type: 'PK', fc: 315, gain: 0.0, q: 0.707 },
  { id: 5, active: false, type: 'PK', fc: 630, gain: 0.0, q: 0.707 },
  { id: 6, active: false, type: 'PK', fc: 2000, gain: 0.0, q: 0.707 },
  { id: 7, active: false, type: 'PK', fc: 5000, gain: 0.0, q: 0.707 },
  { id: 8, active: false, type: 'PK', fc: 12000, gain: 0.0, q: 0.707 },
];
const preampBandsR = preampBands.map((b) => ({ ...b }));
const preampBandsSub = [
  { id: 0, active: true, type: 'LP', fc: 120, gain: 0.0, q: 1.000 },
  { id: 1, active: true, type: 'PK', fc: 35, gain: 0.0, q: 1.000 },
  { id: 2, active: true, type: 'PK', fc: 45, gain: 0.0, q: 1.000 },
  { id: 3, active: true, type: 'PK', fc: 55, gain: 0.0, q: 1.000 },
  { id: 4, active: true, type: 'PK', fc: 70, gain: 0.0, q: 1.000 },
  { id: 5, active: true, type: 'PK', fc: 85, gain: 0.0, q: 1.000 },
  { id: 6, active: true, type: 'PK', fc: 100, gain: 0.0, q: 1.000 },
  { id: 7, active: true, type: 'PK', fc: 120, gain: 0.0, q: 1.000 },
  { id: 8, active: true, type: 'HP', fc: 25, gain: 0.0, q: 1.000 },
];
const preampBandsMic1 = [
  { id: 0, active: true, type: 'LP', fc: 80, gain: 0.0, q: 0.707 },
  { id: 1, active: true, type: 'PK', fc: 160, gain: 0.0, q: 0.707 },
  { id: 2, active: true, type: 'PK', fc: 315, gain: 0.0, q: 0.707 },
  { id: 3, active: true, type: 'PK', fc: 630, gain: 0.0, q: 0.707 },
  { id: 4, active: true, type: 'PK', fc: 1250, gain: 0.0, q: 0.707 },
  { id: 5, active: true, type: 'HP', fc: 6000, gain: 0.0, q: 0.707 },
];
const preampBandsMic2 = preampBandsMic1.map((b) => ({ ...b }));

/* Preset EQ nhạc: chỉ thay đổi Music L/R, dùng đúng 9 band và gói EQ hiện có.
 * Giá trị gain tính theo dB, giữ trong khoảng an toàn để tránh clipping. */
const MUSIC_EQ_PRESETS = {
  eq1: { name: 'Flat - Trung tính', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
  eq2: { name: 'Pop - Sáng, rõ vocal', gains: [-1, 1, 2, 1, 2, 3, 2, 2, 1] },
  eq3: { name: 'Rock - Mạnh và sáng', gains: [4, 3, 2, 0, 1, 3, 4, 4, 3] },
  eq4: { name: 'Dance/EDM - Bass mạnh', gains: [5, 4, 2, 0, 1, 3, 5, 4, 3] },
  eq5: { name: 'Vocal - Nổi giọng hát', gains: [-2, -1, 1, 3, 4, 3, 1, 0, -1] },
  eq6: { name: 'Jazz - Ấm, tự nhiên', gains: [2, 1, 0, 1, 2, 2, 1, 1, 2] },
  eq7: { name: 'Classical - Cân bằng rộng', gains: [3, 2, 1, 0, 1, 2, 3, 3, 2] },
  eq8: { name: 'Bass Boost - Tăng dải trầm', gains: [6, 5, 3, 1, 0, -1, -1, 0, 1] },
  eq9: { name: 'Acoustic - Chi tiết', gains: [1, 0, 0, 2, 3, 3, 4, 4, 3] },
};
let draggingBandId = null;
let isDragging = false;
let draggingSide = null;

function getPreampBands(side) {
  if (side === 'r') return preampBandsR;
  if (side === 'sub') return preampBandsSub;
  if (side === 'mic1') return preampBandsMic1;
  if (side === 'mic2') return preampBandsMic2;
  return preampBands;
}
function getPreampTableBody(side) {
  if (side === 'r') return preampTableBodyR;
  if (side === 'sub') return preampTableBodySub;
  if (side === 'mic1') return preampTableBodyMic1;
  if (side === 'mic2') return preampTableBodyMic2;
  return preampTableBodyL;
}
function getPreampBandChips(side) {
  if (side === 'r') return preampBandChipsR;
  if (side === 'sub') return preampBandChipsSub;
  if (side === 'mic1') return preampBandChipsMic1;
  if (side === 'mic2') return preampBandChipsMic2;
  return preampBandChipsL;
}
function getEqSvg(side) {
  if (side === 'r') return eqSvgR;
  if (side === 'sub') return eqSvgSub;
  if (side === 'mic1') return eqSvgMic1;
  if (side === 'mic2') return eqSvgMic2;
  return eqSvgL;
}
function getSideTxPrefix(side) {
  if (side === 'r') return 'r_';
  if (side === 'sub') return 'sub_';
  if (side === 'mic1') return 'mic1_';
  if (side === 'mic2') return 'mic2_';
  return '';
}
function setDragScrollLock(locked) {
  if (locked) {
    document.body.classList.add('drag-scroll-lock');
  } else {
    document.body.classList.remove('drag-scroll-lock');
  }
}
function setSidebarOpen(open) {
  document.body.classList.toggle('sidebar-open', open);
}

function syncTopbarPanelTitle(tabEl) {
  if (!topbarPanelTitle || !tabEl) return;
  topbarPanelTitle.textContent = tabEl.textContent?.trim() || '';
}

if (btnSidebarToggle) {
  btnSidebarToggle.addEventListener('click', () => {
    const next = !document.body.classList.contains('sidebar-open');
    setSidebarOpen(next);
  });
}
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
}
if (btnSidebarClose) {
  btnSidebarClose.addEventListener('click', () => setSidebarOpen(false));
}


tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.panel;
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(target);
    if (panel) panel.classList.add('active');
    syncTopbarPanelTitle(tab);
    setSidebarOpen(false);
  });
});

syncTopbarPanelTitle(document.querySelector('.tab.active'));

function setConnUI() {
  if (!connState) return;
  connState.textContent = connected ? 'Đã kết nối' : 'Chưa kết nối';
  connState.classList.remove('ok', 'bad');
  connState.classList.add(connected ? 'ok' : 'bad');
}

function setBleLinkState(text, mode = 'normal') {
  if (!bleLinkState) return;
  bleLinkState.textContent = `Trạng thái kết nối: ${text}`;
  bleLinkState.classList.remove('ok', 'bad');
  if (mode === 'ok') bleLinkState.classList.add('ok');
  if (mode === 'bad') bleLinkState.classList.add('bad');
}

function setBleToggleUI() {
  if (!btnBleToggle) return;
  if (bleConnecting) {
    btnBleToggle.textContent = 'Đang kết nối...';
    btnBleToggle.disabled = true;
    btnBleToggle.classList.remove('danger');
    return;
  }
  btnBleToggle.disabled = false;
  if (connected) {
    btnBleToggle.textContent = 'Ngắt kết nối';
    btnBleToggle.classList.add('danger');
  } else {
    btnBleToggle.textContent = 'Kết nối';
    btnBleToggle.classList.remove('danger');
  }
}

function applyBleDisconnectedState(text = 'Chưa kết nối BLE Web') {
  if (configSyncResolve) finishDspConfigSync(false, 'CONFIG sync cancelled: BLE disconnected');
  if (saveAckTimer) clearTimeout(saveAckTimer);
  saveAckTimer = null;
  if (resetAckTimer) clearTimeout(resetAckTimer);
  resetAckTimer = null;
  if (btnSave) btnSave.disabled = false;
  if (btnResetDefaults) btnResetDefaults.disabled = false;
  connected = false;
  bleServer = null;
  bleTxCharacteristic = null;
  lastTxSignature = '';
  txQueue = Promise.resolve();
  setConnUI();
  setBleToggleUI();
  setBleLinkState(text, 'bad');
}

function clearBleReconnectTimer() {
  if (bleReconnectTimer == null) return;
  clearTimeout(bleReconnectTimer);
  bleReconnectTimer = null;
}

function attachBleDevice(device) {
  if (!device) return;
  if (bleDevice && bleDevice !== device) {
    bleDevice.removeEventListener('gattserverdisconnected', handleBleDisconnected);
  }
  bleDevice = device;
  bleDevice.removeEventListener('gattserverdisconnected', handleBleDisconnected);
  bleDevice.addEventListener('gattserverdisconnected', handleBleDisconnected);
}

function rememberBleDevice(device) {
  localStorage.setItem(BLE_AUTO_RECONNECT_KEY, '1');
  if (device?.id) localStorage.setItem(BLE_DEVICE_ID_KEY, device.id);
}

async function restorePermittedBleDevice() {
  if (bleDevice || localStorage.getItem(BLE_AUTO_RECONNECT_KEY) !== '1') return bleDevice;
  if (typeof navigator.bluetooth?.getDevices !== 'function') return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const rememberedId = localStorage.getItem(BLE_DEVICE_ID_KEY);
    const device = devices.find((item) => item.id === rememberedId) || devices[0] || null;
    if (device) {
      attachBleDevice(device);
      appendRxLog(`BLE permission restored: ${device.name || 'known device'}`);
    }
    return device;
  } catch (error) {
    appendRxLog(`Không thể khôi phục quyền BLE: ${error?.message || 'không rõ lỗi'}`);
    return null;
  }
}

async function establishBleConnection(device, reason) {
  if (!device?.gatt) throw new Error('Selected device has no GATT server');
  attachBleDevice(device);
  bleServer = device.gatt.connected ? device.gatt : await device.gatt.connect();

  // Give Android/Chrome and the chip a short interval before service discovery.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const rxReady = await bindBleRxNotifications();
  if (!rxReady) appendRxLog('RX notify unavailable; see the GATT error above');
  const txReady = await bindBleTxCharacteristic();
  if (!txReady) throw new Error('TX write characteristic not found');

  connected = true;
  bleReconnectAttempt = 0;
  rememberBleDevice(device);
  setConnUI();
  setBleToggleUI();
  const name = device.name || bleNameInput?.value || 'Unknown';
  setBleLinkState(`Đã kết nối BLE: ${name}`, 'ok');
  setTxStatus('link up', 'ok');
  appendRxLog(`BLE ${reason}: ${name}`);
  const configSyncOk = await requestDspConfigFromChip();
  if (!device.gatt.connected || !connected) {
    throw new Error('BLE link dropped during DSP configuration read');
  }
  if (!configSyncOk) {
    // GATT link is valid even when optional CONFIG notifications are delayed
    // or unavailable. Keep the link usable and expose the degraded condition.
    setBleLinkState(`Đã kết nối BLE: ${name} (chưa đồng bộ cấu hình)`, 'ok');
    setTxStatus('link up (config sync pending)', 'warn');
    appendRxLog('BLE link vẫn hoạt động; CONFIG sync chưa hoàn tất');
  }
}

function scheduleBleReconnect(reason, immediate = false) {
  if (bleManualDisconnect || document.hidden || connected || bleConnecting) return;
  if (!bleDevice) return;
  clearBleReconnectTimer();
  if (bleReconnectAttempt >= BLE_RECONNECT_DELAYS_MS.length) {
    setBleLinkState('Tự kết nối lại tạm dừng; chạm Kết nối để thử lại', 'bad');
    appendRxLog('BLE auto-reconnect paused after bounded retries');
    return;
  }
  const requestedDelay = immediate ? 0 : BLE_RECONNECT_DELAYS_MS[bleReconnectAttempt];
  const delay = Math.max(BLE_RECONNECT_MIN_DELAY_MS, requestedDelay);
  setBleLinkState(`Sẽ thử kết nối lại sau ${delay} ms`);
  bleReconnectTimer = setTimeout(() => {
    bleReconnectTimer = null;
    reconnectKnownBleDevice(reason);
  }, delay);
}

async function reconnectKnownBleDevice(reason = 'reconnected') {
  if (bleManualDisconnect || document.hidden || connected || bleConnecting) return false;
  if (!bleDevice) await restorePermittedBleDevice();
  if (!bleDevice) return false;

  bleConnecting = true;
  setBleToggleUI();
  setBleLinkState(`Đang kết nối lại (${bleReconnectAttempt + 1}/${BLE_RECONNECT_DELAYS_MS.length})...`);
  setTxStatus('reconnecting...', 'warn');
  let success = false;
  try {
    await establishBleConnection(bleDevice, reason);
    success = true;
  } catch (error) {
    detachBleRxNotifications();
    detachBleTxCharacteristic();
    applyBleDisconnectedState('Kết nối lại BLE chưa thành công');
    bleReconnectAttempt += 1;
    appendRxLog(`Kết nối lại BLE thất bại: ${error?.name || 'Lỗi'}: ${error?.message || 'không rõ lỗi'}`);
  } finally {
    bleConnecting = false;
    setBleToggleUI();
  }
  if (!success) scheduleBleReconnect(reason);
  return success;
}

async function resumeBleConnection(reason) {
  if (document.hidden || bleManualDisconnect || connected || bleConnecting) return;
  if (!bleDevice) await restorePermittedBleDevice();
  if (!bleDevice) return;
  bleReconnectAttempt = 0;
  scheduleBleReconnect(reason, true);
}

function handleBleDisconnected(event) {
  if (event?.target && bleDevice && event.target !== bleDevice) return;
  // Chrome can deliver a stale disconnect event just after a fast reconnect.
  // Do not tear down the newly-established session in that case.
  if (event?.target?.gatt?.connected) {
    appendRxLog('Bỏ qua sự kiện BLE disconnect cũ (GATT đã nối lại)');
    return;
  }
  detachBleRxNotifications();
  detachBleTxCharacteristic();
  appendRxLog('BLE đã ngắt kết nối');
  applyBleDisconnectedState('Đã ngắt kết nối BLE Web');
  setTxStatus('link down', 'bad');
  if (!bleManualDisconnect) {
    bleReconnectAttempt = 0;
    scheduleBleReconnect('reconnected after link loss', true);
  }
}

async function connectBleWeb() {
  if (!navigator.bluetooth) {
    setBleLinkState('Trình duyệt không hỗ trợ BLE Web', 'bad');
    setTxStatus('trình duyệt không hỗ trợ BLE Web', 'bad');
    return;
  }
  bleManualDisconnect = false;
  clearBleReconnectTimer();
  bleReconnectAttempt = 0;
  bleConnecting = true;
  setBleToggleUI();
  setBleLinkState('Đang kết nối BLE Web...');
  setTxStatus('connecting...', 'warn');
  try {
    const optionalServices = [
      'battery_service',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ab00-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb',
    ];
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices,
    });
    if (!device) throw new Error('No BLE device selected');

    await establishBleConnection(device, 'connected');
  } catch (error) {
    const isCancelled = error?.name === 'NotFoundError';
    detachBleRxNotifications();
    detachBleTxCharacteristic();
    applyBleDisconnectedState(isCancelled ? 'Bạn chưa chọn thiết bị BLE' : 'Kết nối BLE thất bại');
    setTxStatus(isCancelled ? 'cancel connect' : 'connect fail', isCancelled ? 'warn' : 'bad');
    appendRxLog(`Kết nối BLE thất bại: ${error?.message || 'không rõ lỗi'}`);
  } finally {
    bleConnecting = false;
    setBleToggleUI();
  }
}

function disconnectBleWeb() {
  bleManualDisconnect = true;
  clearBleReconnectTimer();
  localStorage.removeItem(BLE_AUTO_RECONNECT_KEY);
  localStorage.removeItem(BLE_DEVICE_ID_KEY);
  if (bleDevice && bleDevice.gatt?.connected) {
    appendRxLog('Disconnect requested');
    bleDevice.gatt.disconnect();
    return;
  }
  detachBleRxNotifications();
  detachBleTxCharacteristic();
  applyBleDisconnectedState();
  setTxStatus('link down', 'bad');
}

function setTxStatus(text, mode = 'normal') {
  if (!txState) return;
  const vi = {
    'link up': 'đã kết nối',
    'link down': 'đã ngắt kết nối',
    'reconnecting...': 'đang kết nối lại...',
    'blocked (not connected)': 'chưa kết nối',
    'blocked (TX not ready)': 'kênh gửi chưa sẵn sàng',
    'TX OK': 'đã gửi',
    'TX failed': 'gửi thất bại',
    'SKIPDUP': 'giá trị không đổi',
  };
  txState.textContent = `Gửi: ${vi[text] || text}`;
  txState.classList.remove('ok', 'warn', 'bad');
  if (mode === 'ok') txState.classList.add('ok');
  if (mode === 'warn') txState.classList.add('warn');
  if (mode === 'bad') txState.classList.add('bad');
}

function formatLogTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function appendRxLog(message) {
  if (!rxLogBox) return;
  rxLogLines.push(`[${formatLogTime()}] ${message}`);
  if (rxLogLines.length > 500) rxLogLines.shift();
  rxLogBox.textContent = rxLogLines.join('\n');
  rxLogBox.scrollTop = rxLogBox.scrollHeight;
}

function clearRxLog() {
  rxLogLines.length = 0;
  if (!rxLogBox) return;
  rxLogBox.textContent = '[đã xóa]';
}

function decodeRxValue(dataView) {
  if (!dataView || !dataView.byteLength) return '';
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
  let text = '';
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '').trim();
  } catch (_) {
    text = '';
  }
  if (text) return text;
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function formatBleSampleRate(sampleRate) {
  if (!sampleRate) return 'không rõ';
  if (sampleRate % 1000 === 0) return `${sampleRate / 1000}kHz`;
  return `${(sampleRate / 1000).toFixed(1)}kHz`;
}

function decodeBleStatus(value, bytes) {
  if (bytes.length < 15 || bytes[2] !== 1) return null;
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const a2dpStates = ['chờ', 'đang kết nối', 'đã kết nối', 'đang phát'];
  const sampleRate = view.getUint32(4, true);
  const features = bytes[8];
  const dsp = bytes[9];
  const microphones = [];
  const eq = [];
  const effects = [];
  const musicDsp = [];
  const adc = bytes.length >= 20
    ? `ADC=khung:${bytes[15]} đỉnh1:${view.getUint16(16, true)} đỉnh2:${view.getUint16(18, true)}`
    : null;

  if (features & (1 << 1)) microphones.push('1');
  if (features & (1 << 2)) microphones.push('2');
  if (dsp & (1 << 0)) eq.push('L');
  if (dsp & (1 << 1)) eq.push('R');
  if (dsp & (1 << 2)) eq.push('X');
  if (dsp & (1 << 3)) eq.push('M1');
  if (dsp & (1 << 4)) eq.push('M2');
  if (dsp & (1 << 5)) effects.push('echo');
  if (dsp & (1 << 6)) effects.push('reverb');
  if (dsp & (1 << 7)) effects.push('anti-feedback');
  if (features & (1 << 6)) musicDsp.push('EQ động');
  if (features & (1 << 7)) musicDsp.push('DRC');

  return [
    `STATUS #${bytes[14]}`,
    `A2DP=${a2dpStates[bytes[3]] || `state-${bytes[3]}`}`,
    `Fs=${formatBleSampleRate(sampleRate)}`,
    `ĐƯỜNG DSP=${features & 1 ? 'bật' : 'tắt'}`,
    `MIC=${microphones.length ? microphones.join('+') : 'tắt'}`,
    `SUB=${features & (1 << 3) ? 'bật' : 'tắt'}`,
    `EQ=${eq.length ? eq.join(',') : 'tắt'}`,
    `HIỆU ỨNG=${effects.length ? effects.join(',') : 'tắt'}`,
    `DSP NHẠC=${musicDsp.length ? musicDsp.join(',') : 'tắt'}`,
    `ÂM LƯỢNG=${bytes[10]}/${bytes[11]}/${bytes[12]}/${bytes[13]}%`,
    adc,
  ].filter(Boolean).join(' ');
}

function setControlValueFromMcu(id, value) {
  const control = document.getElementById(id);
  if (!control) return;
  const min = Number(control.min);
  const max = Number(control.max);
  let next = Number(value);
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  control.value = String(next);
  if (control._valueEl) control._valueEl.textContent = formatRangeValue(control);
}

function setToggleFromMcu(toggle, enabled) {
  if (!toggle) return;
  toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function finishDspConfigSync(ok, message) {
  if (configSyncTimer) {
    clearTimeout(configSyncTimer);
    configSyncTimer = null;
  }
  const resolve = configSyncResolve;
  configSyncResolve = null;
  if (message) appendRxLog(message);
  if (resolve) resolve(ok);
}

function renderMcuConfigOnInterface() {
  ['l', 'r', 'sub', 'mic1', 'mic2'].forEach((side) => {
    syncBandChipUI(side);
    renderPreampRows(side);
    renderEqLine(side);
  });
  syncDynamicEqThresholdLimits();
  updateDrcCurve();
  document.querySelectorAll('input[type="range"]').forEach((control) => {
    if (control._valueEl) control._valueEl.textContent = formatRangeValue(control);
  });
}

function applyMcuConfigItem(value, bytes) {
  if (bytes.length < 3) return false;
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const command = bytes[2];

  if ((command === DSP_CMD_SET_BT_NAME || command === DSP_CMD_SET_BLE_NAME)
      && bytes.length >= 4) {
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(3));
    const input = command === DSP_CMD_SET_BT_NAME ? btNameInput : bleNameInput;
    if (input) input.value = name;
    if (command === DSP_CMD_SET_BT_NAME && chipDevice) chipDevice.textContent = name;
    return true;
  }

  if (command === 0x01 && bytes.length === 5) {
    const volumeIds = ['l-gain', 'r-gain', 'sub-gain', 'mic-output-gain'];
    if (volumeIds[bytes[3]]) setControlValueFromMcu(volumeIds[bytes[3]], bytes[4]);
    return true;
  }

  if (command === DSP_CMD_SET_SUB_PHASE && bytes.length === 4) {
    syncSubPhaseUI(bytes[3] !== 0 ? 180 : 0);
    return true;
  }

  if (command === DSP_CMD_SET_KC_MODE && bytes.length === 4) {
    if (kcModeSelect) kcModeSelect.value = String(Math.min(2, bytes[3]));
    return true;
  }

  if (command === 0x02 && bytes.length === 13) {
    const sides = ['l', 'r', 'sub', 'mic1', 'mic2'];
    const types = ['PK', 'LS', 'HS', 'LP', 'HP', 'BP', 'NOTCH', 'LP', 'HP'];
    const side = sides[bytes[3]];
    const band = side ? getPreampBands(side)[bytes[4]] : null;
    if (band) {
      band.active = bytes[5] !== 0;
      band.type = types[bytes[6]] || 'PK';
      band.fc = view.getUint16(7, true);
      band.gain = view.getInt16(9, true) / 256;
      band.q = view.getUint16(11, true) / 1024;
    }
    return true;
  }

  if ((command === 0x03 || command === 0x04) && bytes.length === 6) {
    const effectIds = command === 0x03
      ? ['echo-level', 'echo-delay', 'echo-repeat', 'echo-mix']
      : ['rv-level', 'rv-pre-delay', 'rv-decay', 'rv-mix', 'rv-room', 'rv-damping'];
    const id = effectIds[bytes[3]];
    let effectValue = view.getUint16(4, true);
    if (command === 0x04 && bytes[3] === 2) effectValue /= 10;
    if (id) setControlValueFromMcu(id, effectValue);
    return true;
  }

  if (command === 0x05 && bytes.length === 6) {
    setToggleFromMcu(micAfbToggle, bytes[3] !== 0);
    setControlValueFromMcu('mic-afb-freq', view.getInt16(4, true) / 100);
    return true;
  }

  if (command === 0x06 && bytes.length === 19) {
    setToggleFromMcu(dynEqToggle, bytes[3] !== 0);
    setControlValueFromMcu('dyn-low-freq', view.getUint16(4, true));
    setControlValueFromMcu('dyn-high-freq', view.getUint16(6, true));
    setControlValueFromMcu('dyn-low-bass', view.getInt8(8) / 2);
    setControlValueFromMcu('dyn-low-treble', view.getInt8(9) / 2);
    setControlValueFromMcu('dyn-high-bass', view.getInt8(10) / 2);
    setControlValueFromMcu('dyn-high-treble', view.getInt8(11) / 2);
    setControlValueFromMcu('dyn-th-low', view.getInt8(12));
    setControlValueFromMcu('dyn-th-normal', view.getInt8(13));
    setControlValueFromMcu('dyn-th-high', view.getInt8(14));
    setControlValueFromMcu('dyn-attack', view.getUint16(15, true));
    setControlValueFromMcu('dyn-release', view.getUint16(17, true));
    return true;
  }

  if (command === 0x07 && bytes.length === 11) {
    setToggleFromMcu(drcToggle, bytes[3] !== 0);
    setControlValueFromMcu('drc-pregain', view.getInt8(4));
    setControlValueFromMcu('drc-threshold', view.getInt8(5));
    setControlValueFromMcu('drc-ratio', bytes[6]);
    setControlValueFromMcu('drc-attack', view.getUint16(7, true));
    setControlValueFromMcu('drc-release', view.getUint16(9, true));
    return true;
  }

  return false;
}

function handleBleRxNotification(event) {
  const value = event?.target?.value;
  if (value?.byteLength >= 4) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (bytes[0] === 0xa5 && bytes[1] === 0x80) {
      const ok = bytes[3] === 0;
      const command = bytes[2];
      if (command === DSP_CMD_SAVE_CONFIG) {
        if (saveAckTimer) clearTimeout(saveAckTimer);
        saveAckTimer = null;
        if (btnSave) btnSave.disabled = false;
        setTxStatus(ok ? 'đã lưu MCU' : `lưu lỗi ${bytes[3]}`, ok ? 'ok' : 'bad');
      } else if (command === DSP_CMD_RESET_DEFAULTS) {
        if (resetAckTimer) clearTimeout(resetAckTimer);
        resetAckTimer = null;
        if (btnResetDefaults) btnResetDefaults.disabled = false;
        setTxStatus(ok ? 'đã khôi phục mặc định' : `reset lỗi ${bytes[3]}`, ok ? 'ok' : 'bad');
      } else {
        setTxStatus(ok ? 'đã xác nhận' : `xác nhận lỗi ${bytes[3]}`, ok ? 'ok' : 'bad');
      }
      appendRxLog(`RX ACK cmd=0x${bytes[2].toString(16).padStart(2, '0')} status=${bytes[3]}`);
      if (command === DSP_CMD_GET_CONFIG && !ok) {
        finishDspConfigSync(false, `MCU từ chối đọc cấu hình, mã lỗi=${bytes[3]}`);
      }
      return;
    }
    if (bytes[0] === 0xa5 && bytes[1] === 0x81) {
      const status = decodeBleStatus(value, bytes);
      appendRxLog(status || `Trạng thái không hỗ trợ (${bytes.length} byte)`);
      return;
    }
    if (bytes[0] === 0xa5 && bytes[1] === DSP_EVENT_CONFIG_BEGIN && bytes.length === 8) {
      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      configSyncExpectedItems = bytes[3];
      configSyncReceivedItems = 0;
      configSyncRevision = view.getUint32(4, true);
      appendRxLog(`CONFIG begin v${bytes[2]} items=${configSyncExpectedItems} rev=${configSyncRevision}`);
      return;
    }
    if (bytes[0] === 0xa5 && bytes[1] === DSP_EVENT_CONFIG_ITEM) {
      if (applyMcuConfigItem(value, bytes)) configSyncReceivedItems += 1;
      return;
    }
    if (bytes[0] === 0xa5 && bytes[1] === DSP_EVENT_CONFIG_END && bytes.length === 7) {
      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      const status = bytes[2];
      const revision = view.getUint32(3, true);
      renderMcuConfigOnInterface();
      setTxStatus(status === 0 ? 'đồng bộ MCU' : `sync lỗi ${status}`, status === 0 ? 'ok' : 'bad');
      finishDspConfigSync(status === 0,
        `CONFIG end items=${configSyncReceivedItems}/${configSyncExpectedItems} rev=${revision}`);
      return;
    }
  }
  const payload = decodeRxValue(value);
  appendRxLog(`RX ${payload || '(empty)'}`);
}

function detachBleRxNotifications() {
  if (!bleRxCharacteristic) return;
  try {
    bleRxCharacteristic.removeEventListener('characteristicvaluechanged', handleBleRxNotification);
    bleRxCharacteristic.stopNotifications().catch(() => {});
  } catch (_) {
    // no-op
  }
  bleRxCharacteristic = null;
}

function detachBleTxCharacteristic() {
  bleTxCharacteristic = null;
}

async function bindBleRxNotifications() {
  if (!bleServer) return false;
  detachBleRxNotifications();
  detachBleTxCharacteristic();

  const candidates = [
    { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
    { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', characteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
    { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { service: '0000ab00-0000-1000-8000-00805f9b34fb', characteristic: '0000ab02-0000-1000-8000-00805f9b34fb' },
  ];

  for (const item of candidates) {
    let characteristic = null;
    try {
      const service = await bleServer.getPrimaryService(item.service);
      characteristic = await service.getCharacteristic(item.characteristic);
      appendRxLog(`RX characteristic found (${item.characteristic.slice(0, 8)}...), enabling notify`);
      characteristic.addEventListener('characteristicvaluechanged', handleBleRxNotification);
      await characteristic.startNotifications();
      bleRxCharacteristic = characteristic;
      appendRxLog(`RX notify ready (${item.characteristic.slice(0, 8)}...)`);
      return true;
    } catch (error) {
      appendRxLog(`RX candidate ${item.characteristic.slice(0, 8)} lỗi: ${error?.name || 'Error'}: ${error?.message || 'unknown error'}`);
      if (characteristic) {
        characteristic.removeEventListener('characteristicvaluechanged', handleBleRxNotification);
        appendRxLog(`RX startNotifications failed: ${error?.name || 'Error'}: ${error?.message || 'unknown'}`);
      }
      // Try next known service/characteristic pair.
    }
  }
  // Fallback for stacks that expose the vendor UUID in a different textual
  // form (16-bit vs 128-bit) or reorder the primary-service table.
  try {
    const services = await bleServer.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      const serviceUuid = String(service.uuid || '').toLowerCase();
      if (!(serviceUuid.includes('ff00') || serviceUuid.includes('ab00'))) continue;
      const characteristic = characteristics.find((candidate) => {
        const uuid = String(candidate.uuid || '').toLowerCase();
        return (uuid.includes('ff02') || uuid.includes('ab02'))
          && (candidate.properties?.notify || candidate.properties?.indicate);
      });
      if (!characteristic) continue;
      appendRxLog(`RX fallback characteristic ${characteristic.uuid}, enabling notify`);
      characteristic.addEventListener('characteristicvaluechanged', handleBleRxNotification);
      await characteristic.startNotifications();
      bleRxCharacteristic = characteristic;
      appendRxLog(`RX fallback notify ready (${characteristic.uuid})`);
      return true;
    }
  } catch (error) {
    appendRxLog(`RX service enumeration lỗi: ${error?.name || 'Error'}: ${error?.message || 'unknown error'}`);
  }
  return false;
}

async function bindBleTxCharacteristic() {
  if (!bleServer) return false;
  detachBleTxCharacteristic();
  const candidates = [
    { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff01-0000-1000-8000-00805f9b34fb' },
    { service: '0000ab00-0000-1000-8000-00805f9b34fb', characteristic: '0000ab01-0000-1000-8000-00805f9b34fb' },
  ];
  for (const item of candidates) {
    try {
      const service = await bleServer.getPrimaryService(item.service);
      bleTxCharacteristic = await service.getCharacteristic(item.characteristic);
      appendRxLog(`TX write ready (${item.characteristic.slice(0, 8)}...)`);
      return true;
    } catch (error) {
      appendRxLog(`TX candidate ${item.characteristic.slice(0, 8)} lỗi: ${error?.name || 'Error'}: ${error?.message || 'unknown error'}`);
      // Try the next supported DSP service.
    }
  }
  try {
    const services = await bleServer.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      const serviceUuid = String(service.uuid || '').toLowerCase();
      if (!(serviceUuid.includes('ff00') || serviceUuid.includes('ab00'))) continue;
      const characteristic = characteristics.find((candidate) => {
        const uuid = String(candidate.uuid || '').toLowerCase();
        return (uuid.includes('ff01') || uuid.includes('ab01'))
          && (candidate.properties?.write || candidate.properties?.writeWithoutResponse);
      });
      if (!characteristic) continue;
      bleTxCharacteristic = characteristic;
      appendRxLog(`TX fallback write ready (${characteristic.uuid})`);
      return true;
    }
  } catch (error) {
    appendRxLog(`TX service enumeration lỗi: ${error?.name || 'Error'}: ${error?.message || 'unknown error'}`);
  }
  return false;
}

function buildEqPacket(side, bandId) {
  const targetMap = { l: 0, r: 1, sub: 2, mic1: 3, mic2: 4 };
  const typeMap = { PK: 0, LS: 1, HS: 2, LP: 3, HP: 4, BP: 5, NOTCH: 6 };
  const band = getPreampBands(side)[bandId];
  if (!band || targetMap[side] == null || typeMap[band.type] == null) return null;
  const packet = new Uint8Array(12);
  const view = new DataView(packet.buffer);
  packet[0] = 0xa5;
  packet[1] = 0x02;
  packet[2] = targetMap[side];
  packet[3] = bandId;
  packet[4] = band.active ? 1 : 0;
  packet[5] = typeMap[band.type];
  view.setUint16(6, Math.max(20, Math.min(20000, Math.round(band.fc))), true);
  view.setInt16(8, Math.round(Math.max(-18, Math.min(18, band.gain)) * 256), true);
  view.setUint16(10, Math.round(Math.max(0.1, Math.min(10, band.q)) * 1024), true);
  return packet;
}

function buildEffectPacket(tag) {
  const specs = {
    'echo-level':     { command: 0x03, param: 0, scale: 1, min: 0, max: 100 },
    'echo-delay':     { command: 0x03, param: 1, scale: 1, min: 1, max: 300 },
    'echo-repeat':    { command: 0x03, param: 2, scale: 1, min: 0, max: 100 },
    'echo-mix':       { command: 0x03, param: 3, scale: 1, min: 0, max: 100 },
    'rv-level':       { command: 0x04, param: 0, scale: 1, min: 0, max: 100 },
    'rv-pre-delay':   { command: 0x04, param: 1, scale: 1, min: 0, max: 100 },
    'rv-decay':       { command: 0x04, param: 2, scale: 10, min: 1, max: 100 },
    'rv-mix':         { command: 0x04, param: 3, scale: 1, min: 0, max: 100 },
    'rv-room':        { command: 0x04, param: 4, scale: 1, min: 0, max: 100 },
    'rv-damping':     { command: 0x04, param: 5, scale: 1, min: 0, max: 100 },
  };
  const match = tag.match(/^([^:]+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const spec = specs[match[1]];
  const input = Number(match[2]);
  if (!spec || !Number.isFinite(input)) return null;

  const value = Math.max(spec.min, Math.min(spec.max, Math.round(input * spec.scale)));
  const packet = new Uint8Array(5);
  packet[0] = 0xa5;
  packet[1] = spec.command;
  packet[2] = spec.param;
  new DataView(packet.buffer).setUint16(3, value, true);
  return packet;
}

function readControlNumber(id, min, max, fallback) {
  const control = document.getElementById(id);
  let value = Number(control?.value);
  if (!Number.isFinite(value)) value = fallback;
  value = Math.max(min, Math.min(max, value));
  if (control) control.value = String(value);
  return value;
}

function isToggleOn(toggle) {
  return toggle?.getAttribute('aria-pressed') === 'true';
}

function buildAntiFeedbackPacket() {
  const shiftCentiHz = Math.round(readControlNumber('mic-afb-freq', 0, 10, 5) * 100);
  const packet = new Uint8Array(5);
  packet[0] = 0xa5;
  packet[1] = 0x05;
  packet[2] = isToggleOn(micAfbToggle) ? 1 : 0;
  new DataView(packet.buffer).setInt16(3, shiftCentiHz, true);
  return packet;
}

function buildDynamicEqPacket() {
  syncDynamicEqThresholdLimits();
  const lowFreq = Math.round(readControlNumber('dyn-low-freq', 50, 500, 100));
  const highFreq = Math.round(readControlNumber('dyn-high-freq', 2000, 12000, 8000));
  const lowBassX2 = Math.round(readControlNumber('dyn-low-bass', -18, 18, 3) * 2);
  const lowTrebleX2 = Math.round(readControlNumber('dyn-low-treble', -18, 18, 2) * 2);
  const highBassX2 = Math.round(readControlNumber('dyn-high-bass', -18, 18, -1) * 2);
  const highTrebleX2 = Math.round(readControlNumber('dyn-high-treble', -18, 18, -2) * 2);
  const thresholdLow = Math.round(readControlNumber('dyn-th-low', -90, 0, -45));
  const thresholdNormal = Math.round(readControlNumber('dyn-th-normal', -90, 0, -24));
  const thresholdHigh = Math.round(readControlNumber('dyn-th-high', -90, 0, -8));
  const attackMs = Math.round(readControlNumber('dyn-attack', 1, 500, 80));
  const releaseMs = Math.round(readControlNumber('dyn-release', 10, 2000, 500));

  if (lowFreq >= highFreq || thresholdLow > thresholdNormal ||
      thresholdNormal > thresholdHigh || thresholdLow >= thresholdHigh) {
    lastPacketError = 'Dynamic EQ cần Low threshold ≤ Normal threshold ≤ High threshold';
    return null;
  }

  const packet = new Uint8Array(18);
  const view = new DataView(packet.buffer);
  packet[0] = 0xa5;
  packet[1] = 0x06;
  packet[2] = isToggleOn(dynEqToggle) ? 1 : 0;
  view.setUint16(3, lowFreq, true);
  view.setUint16(5, highFreq, true);
  packet[7] = lowBassX2 & 0xff;
  packet[8] = lowTrebleX2 & 0xff;
  packet[9] = highBassX2 & 0xff;
  packet[10] = highTrebleX2 & 0xff;
  packet[11] = thresholdLow & 0xff;
  packet[12] = thresholdNormal & 0xff;
  packet[13] = thresholdHigh & 0xff;
  view.setUint16(14, attackMs, true);
  view.setUint16(16, releaseMs, true);
  return packet;
}

function buildDrcPacket() {
  const pregainDb = Math.round(readControlNumber('drc-pregain', -12, 12, 0));
  const thresholdDb = Math.round(readControlNumber('drc-threshold', -90, 0, -6));
  const ratio = Math.round(readControlNumber('drc-ratio', 1, 20, 4));
  const attackMs = Math.round(readControlNumber('drc-attack', 1, 500, 10));
  const releaseMs = Math.round(readControlNumber('drc-release', 10, 2000, 250));
  const packet = new Uint8Array(10);
  const view = new DataView(packet.buffer);
  packet[0] = 0xa5;
  packet[1] = 0x07;
  packet[2] = isToggleOn(drcToggle) ? 1 : 0;
  packet[3] = pregainDb & 0xff;
  packet[4] = thresholdDb & 0xff;
  packet[5] = ratio;
  view.setUint16(6, attackMs, true);
  view.setUint16(8, releaseMs, true);
  return packet;
}

function buildBlePacket(tag) {
  lastPacketError = '';
  if (tag === 'save') return Uint8Array.of(0xa5, DSP_CMD_SAVE_CONFIG);
  if (tag === 'config-get') return Uint8Array.of(0xa5, DSP_CMD_GET_CONFIG);
  if (tag === 'reset-defaults') return Uint8Array.of(0xa5, DSP_CMD_RESET_DEFAULTS);
  const kcModeMatch = tag.match(/^kc-mode_([0-2])$/);
  if (kcModeMatch) {
    return Uint8Array.of(0xa5, DSP_CMD_SET_KC_MODE, Number(kcModeMatch[1]));
  }
  const nameCommand = tag.startsWith('bt_name_') ? DSP_CMD_SET_BT_NAME
    : (tag.startsWith('ble_name_') ? DSP_CMD_SET_BLE_NAME : null);
  if (nameCommand != null) {
    const prefix = nameCommand === DSP_CMD_SET_BT_NAME ? 'bt_name_' : 'ble_name_';
    const name = tag.slice(prefix.length).trim();
    if (!name) {
      lastPacketError = 'Tên Bluetooth không được để trống';
      return null;
    }
    const nameBytes = new TextEncoder().encode(name);
    if (nameBytes.length > DSP_DEVICE_NAME_MAX_BYTES) {
      lastPacketError = `Tên Bluetooth tối đa ${DSP_DEVICE_NAME_MAX_BYTES} byte UTF-8`;
      return null;
    }
    // Reject control characters; UTF-8 Vietnamese/emoji remains valid.
    if ([...name].some((character) => {
      const code = character.codePointAt(0);
      return code < 0x20 || code === 0x7f;
    })) {
      lastPacketError = 'Tên Bluetooth không được chứa ký tự điều khiển';
      return null;
    }
    return Uint8Array.from([0xa5, nameCommand, ...nameBytes]);
  }
  const subPhaseMatch = tag.match(/^sub_phase_(0|180)$/);
  if (subPhaseMatch) {
    return Uint8Array.of(0xa5, DSP_CMD_SET_SUB_PHASE,
      Number(subPhaseMatch[1]) === 180 ? 1 : 0);
  }
  const volumeTargets = { 'l-gain': 0, 'r-gain': 1, 'sub-gain': 2, 'mic-output-gain': 3 };
  const volumeMatch = tag.match(/^([^:]+):(\d+(?:\.\d+)?)$/);
  if (volumeMatch && volumeTargets[volumeMatch[1]] != null) {
    return Uint8Array.of(0xa5, 0x01, volumeTargets[volumeMatch[1]], Math.max(0, Math.min(100, Math.round(Number(volumeMatch[2])))));
  }

  const eqMatch = tag.match(/^(?:band|drag)_(?:(r|sub|mic1|mic2)_)?F(\d+)_/);
  if (eqMatch) {
    return buildEqPacket(eqMatch[1] || 'l', Number(eqMatch[2]));
  }
  if (tag === 'afb-sync' || tag.startsWith('mic_afb_') || tag.startsWith('mic-afb-freq:')) {
    return buildAntiFeedbackPacket();
  }
  if (tag === 'dyn-sync' || tag.startsWith('dyn-')) {
    return buildDynamicEqPacket();
  }
  if (tag === 'drc-sync' || tag.startsWith('drc-')) {
    return buildDrcPacket();
  }
  return buildEffectPacket(tag);
}

function syncDynamicEqThresholdLimits(changedControl = null) {
  const lowControl = document.getElementById('dyn-th-low');
  const normalControl = document.getElementById('dyn-th-normal');
  const highControl = document.getElementById('dyn-th-high');
  if (!lowControl || !normalControl || !highControl) return;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let low = clamp(Number(lowControl.value), -90, 0);
  let normal = clamp(Number(normalControl.value), -90, 0);
  let high = clamp(Number(highControl.value), -90, 0);

  if (changedControl === lowControl) {
    low = Math.min(low, -1);
    if (normal < low) normal = low;
    if (high <= low) high = Math.min(0, low + 1);
  } else if (changedControl === highControl) {
    high = Math.max(high, -89);
    if (normal > high) normal = high;
    if (low >= high) low = Math.max(-90, high - 1);
  } else if (changedControl === normalControl) {
    normal = clamp(normal, low, high);
  } else {
    if (low >= high) high = Math.min(0, low + 1);
    if (low >= high) low = Math.max(-90, high - 1);
    normal = clamp(normal, low, high);
  }

  lowControl.value = String(low);
  normalControl.value = String(normal);
  highControl.value = String(high);
  lowControl.max = String(Math.min(normal, high - 1));
  normalControl.min = String(low);
  normalControl.max = String(high);
  highControl.min = String(Math.max(normal, low + 1));

  [lowControl, normalControl, highControl].forEach((control) => {
    if (control._valueEl) control._valueEl.textContent = formatRangeValue(control);
  });
}

async function requestDspConfigFromChip() {
  if (configSyncResolve) finishDspConfigSync(false, 'Restarting CONFIG synchronization');
  configSyncExpectedItems = 0;
  configSyncReceivedItems = 0;
  configSyncRevision = 0;
  appendRxLog('Requesting DSP configuration from MCU...');

  const completion = new Promise((resolve) => {
    configSyncResolve = resolve;
    configSyncTimer = setTimeout(() => {
      finishDspConfigSync(false, 'CONFIG sync timeout; MCU values were not overwritten');
    }, 7000);
  });
  await sendTx('config-get');
  return completion;
}

function packetSignature(packet) {
  return Array.from(packet).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function performTx(tag) {
  if (!connected) {
    setTxStatus('blocked (not connected)', 'bad');
    return;
  }
  if (!bleTxCharacteristic) {
    setTxStatus('blocked (TX not ready)', 'bad');
    return;
  }
  const packet = buildBlePacket(tag);
  if (!packet) {
    const message = lastPacketError || 'unsupported control';
    setTxStatus(message, 'warn');
    if (lastPacketError) appendRxLog(`TX blocked: ${lastPacketError}`);
    return;
  }
  const signature = packetSignature(packet);
  const repeatableCommand = packet[1] === DSP_CMD_SAVE_CONFIG
    || packet[1] === DSP_CMD_GET_CONFIG
    || packet[1] === DSP_CMD_RESET_DEFAULTS;
  if (!repeatableCommand && lastTxSignature === signature) {
    setTxStatus('SKIPDUP', 'warn');
    return;
  }
  try {
    if (typeof bleTxCharacteristic.writeValueWithResponse === 'function') {
      await bleTxCharacteristic.writeValueWithResponse(packet);
    } else {
      await bleTxCharacteristic.writeValue(packet);
    }
    lastTxSignature = signature;
    setTxStatus('TX OK', 'ok');
    appendRxLog(`TX ${tag}`);
  } catch (error) {
    setTxStatus('TX failed', 'bad');
    appendRxLog(`TX failed: ${error?.name || 'Error'}: ${error?.message || 'unknown error'}`);
  }
}

function sendTx(tag) {
  const job = txQueue.then(() => performTx(tag), () => performTx(tag));
  txQueue = job.catch(() => {});
  return job;
}

function hidePwaBar() {
  if (!pwaBar) return;
  pwaBar.hidden = true;
  pwaBar.classList.add('is-hidden');
}

function isRunningAsInstalledApp() {
  const mm = (q) => window.matchMedia && window.matchMedia(q).matches;
  const iosStandalone = typeof navigator.standalone === 'boolean' ? navigator.standalone : false;
  return (
    mm('(display-mode: standalone)') ||
    mm('(display-mode: window-controls-overlay)') ||
    mm('(display-mode: fullscreen)') ||
    mm('(display-mode: minimal-ui)') ||
    iosStandalone ||
    document.referrer.startsWith('android-app://')
  );
}

function showPwaBar() {
  if (!pwaBar) return;
  if (pwaBarClosedByUser) return;
  if (!deferredInstallPrompt) return;
  if (isRunningAsInstalledApp()) return;
  if (location.protocol === 'file:') return;
  pwaBar.classList.remove('is-hidden');
  pwaBar.hidden = false;
}

function inferRangeUnit(rangeEl) {
  const id = rangeEl.id || '';
  if (id.includes('freq') || id.includes('lpf') || id.includes('hpf')) return 'Hz';
  if (id.includes('atk') || id.includes('attack') || id.includes('rel') || id.includes('release')) return 'ms';
  if (id.includes('thr') || id.includes('threshold') || id.includes('depth')) return 'dB';
  if (id.includes('gain') || id.includes('fx-send') || id.includes('afb') || id.includes('noise') || id.includes('mic')) return '';
  return '';
}

function formatRangeValue(rangeEl) {
  const raw = Number(rangeEl.value);
  const step = Number(rangeEl.step || '1');
  const unit = rangeEl.dataset.unit || inferRangeUnit(rangeEl);
  const valueText = Number.isFinite(step) && step < 1 ? raw.toFixed(1) : String(Math.round(raw));
  return unit ? `${valueText} ${unit}` : valueText;
}

function ensureRangeValueEl(rangeEl) {
  let valueEl = rangeEl._valueEl;
  if (valueEl) return valueEl;

  valueEl = document.createElement('span');
  valueEl.className = 'range-live-value';

  const dynFader = rangeEl.closest('.dyn-fader');
  if (dynFader) {
    valueEl.classList.add('dyn-fader-value');
    dynFader.appendChild(valueEl);
  } else {
    const host = rangeEl.closest('label') || rangeEl.parentElement;
    if (host) host.appendChild(valueEl);
  }

  rangeEl._valueEl = valueEl;
  return valueEl;
}

function initRangeLiveValues() {
  const ranges = document.querySelectorAll('input[type="range"]');
  ranges.forEach((rangeEl) => {
    const valueEl = ensureRangeValueEl(rangeEl);
    const render = () => {
      valueEl.textContent = formatRangeValue(rangeEl);
    };
    render();
    rangeEl.addEventListener('input', render);
    rangeEl.addEventListener('change', render);
  });
}

function renderEqLine(target) {
  const line = (target === 'l' || target === 'r' || target === 'sub' || target === 'mic1' || target === 'mic2')
    ? document.getElementById(`eq-path-${target}`)
    : document.getElementById(`eq-line-${target}`);
  const pointsGroup = document.getElementById(`eq-points-${target}`);
  const labelsGroup = document.getElementById(`eq-labels-${target}`);
  if (!line) return;

  let mapped = [];
  if (target === 'l' || target === 'r' || target === 'sub' || target === 'mic1' || target === 'mic2') {
    renderFreqAxis(target);
    const bands = getPreampBands(target);
    const activeBands = bands.filter((b) => b.active);
    if (!activeBands.length) {
      line.setAttribute('d', 'M 0 15 L 100 15');
      if (pointsGroup) pointsGroup.innerHTML = '';
      if (labelsGroup) labelsGroup.innerHTML = '';
      return;
    }
    mapped = activeBands.map((b) => {
      const x = freqToLogX(b.fc);
      const y = dbToY(b.gain);
      return { x, y, label: `F${b.id}`, bandId: b.id };
    });
    line.setAttribute('d', buildEqResponsePath(activeBands));
  } else {
    const sliders = document.querySelectorAll(`.eq-band[data-eq-target="${target}"]`);
    if (!sliders.length) return;
    const values = Array.from(sliders).map((s) => Number(s.value));
    const step = 100 / (values.length - 1);
    mapped = values.map((v, i) => {
      const x = i * step;
      const y = 15 - (v * 0.9);
      return { x, y };
    });
  }

  mapped.sort((a, b) => a.x - b.x);
  if (target !== 'l' && target !== 'r' && target !== 'sub' && target !== 'mic1' && target !== 'mic2') {
    const points = mapped.map((p) => `${p.x},${p.y}`).join(' ');
    line.setAttribute('points', points);
  }
  if (pointsGroup) {
    pointsGroup.innerHTML = mapped.map((p) => `
      <circle class="eq-point-hit" cx="${p.x}" cy="${p.y}" r="2.8" data-band="${p.bandId ?? ''}"></circle>
      <circle class="eq-point-core" cx="${p.x}" cy="${p.y}" r="1.45" data-band="${p.bandId ?? ''}" pointer-events="none"></circle>
    `).join('');
  }
  if (labelsGroup && (target === 'l' || target === 'r' || target === 'sub' || target === 'mic1' || target === 'mic2')) {
    const bands = getPreampBands(target);
    const labelAnchors = new Map();
    if (mapped.length) {
      const leftBound = 6;
      const rightBound = 94;
      const span = rightBound - leftBound;
      const slots = mapped.map((p) => Math.max(leftBound, Math.min(rightBound, p.x)));
      const minGap = Math.min(12, Math.max(8, span / Math.max(1, mapped.length - 1)));

      for (let i = 1; i < slots.length; i += 1) {
        slots[i] = Math.max(slots[i], slots[i - 1] + minGap);
      }
      if (slots.length) {
        slots[slots.length - 1] = Math.min(slots[slots.length - 1], rightBound);
      }
      for (let i = slots.length - 2; i >= 0; i -= 1) {
        slots[i] = Math.min(slots[i], slots[i + 1] - minGap);
      }
      mapped.forEach((p, i) => {
        labelAnchors.set(p.bandId, slots[i]);
      });
    }

    labelsGroup.innerHTML = mapped.map((p, idx) => {
      const band = bands[p.bandId];
      const typeText = String(band?.type || 'PK').toUpperCase();
      const freqText = formatFreq(band?.fc ?? 0);
      const gainText = `${(band?.gain ?? 0).toFixed(1)} dB`;
      const labelX = labelAnchors.get(p.bandId) ?? Math.max(7, Math.min(93, p.x));
      const yOffset = idx % 2 === 0 ? 4.2 : 5.3;
      const yTop = Math.max(2.2, p.y - yOffset);
      const yBottom = yTop + 2.15;
      return `
        <text class="eq-point-tag eq-point-tag-title" x="${labelX}" y="${yTop}" text-anchor="middle">F${p.bandId} | ${freqText}</text>
        <text class="eq-point-tag eq-point-tag-sub" x="${labelX}" y="${yBottom}" text-anchor="middle">${typeText} | ${gainText}</text>
      `;
    }).join('');
  }
}

function freqToLogX(fc) {
  const minF = EQ_MIN_FREQ;
  const maxF = getEqMaxFreq();
  const f = Math.max(minF, Math.min(maxF, Number(fc) || minF));
  const ratio = (Math.log10(f) - Math.log10(minF)) / (Math.log10(maxF) - Math.log10(minF));
  return Math.max(0, Math.min(100, ratio * 100));
}

function xToFreq(x) {
  const minF = EQ_MIN_FREQ;
  const maxF = getEqMaxFreq();
  const ratio = Math.max(0, Math.min(1, x / 100));
  const freq = 10 ** (Math.log10(minF) + ratio * (Math.log10(maxF) - Math.log10(minF)));
  return Math.round(freq);
}

function getEqSampleRate() {
  const fromWin = Number(window.EQ_FS);
  const fromQuery = Number(new URLSearchParams(window.location.search).get('fs'));
  const fs = Number.isFinite(fromWin) && fromWin > 2000
    ? fromWin
    : (Number.isFinite(fromQuery) && fromQuery > 2000 ? fromQuery : EQ_DEFAULT_FS);
  return Math.max(8000, Math.min(192000, fs));
}

function getEqMaxFreq() {
  const nyquist = getEqSampleRate() * 0.5;
  return Math.max(EQ_MIN_FREQ * 2, Math.min(EQ_MAX_FREQ_HARD, nyquist));
}

function parseTickTextToFreq(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return null;
  if (s.endsWith('k')) return Number(s.slice(0, -1)) * 1000;
  return Number(s);
}

function formatTickFreq(freq) {
  if (freq >= 1000) {
    const k = freq / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${Math.round(freq)}`;
}

function renderFreqAxis(side = 'l') {
  const row = document.querySelector(`.freq-row[data-side="${side}"]`) || document.querySelector(`#ch-${side} .freq-row`);
  if (!row) return;
  const ticks = Array.from(row.querySelectorAll('span'));
  if (!ticks.length) return;

  row.style.position = 'relative';
  row.style.height = '16px';

  const maxF = getEqMaxFreq();
  ticks.forEach((tick) => {
    const f = parseTickTextToFreq(tick.dataset.freq || tick.textContent);
    if (!Number.isFinite(f) || f < EQ_MIN_FREQ || f > maxF) {
      tick.style.display = 'none';
      return;
    }
    tick.style.display = 'block';
    tick.style.position = 'absolute';
    tick.style.left = `${freqToLogX(f)}%`;
    tick.style.transform = 'translateX(-50%)';
    tick.textContent = formatTickFreq(f);
  });

  // Keep edge labels inside viewport on narrow screens.
  const first = ticks[0];
  if (first) {
    first.style.left = '0%';
    first.style.transform = 'translateX(0)';
  }

  // Ensure right-most Nyquist tick always visible when Fs < 40k.
  const last = ticks[ticks.length - 1];
  if (maxF < EQ_MAX_FREQ_HARD && last) {
    last.style.display = 'block';
    last.style.position = 'absolute';
    last.style.left = '100%';
    last.style.transform = 'translateX(-100%)';
    last.textContent = formatTickFreq(maxF);
  }
}

function yToGain(y) {
  const gain = DB_MAX - (Math.max(0, Math.min(CHART_H, y)) / CHART_H) * (DB_MAX - DB_MIN);
  return Math.max(DB_MIN, Math.min(DB_MAX, Math.round(gain * 10) / 10));
}

function qToTension(q) {
  const qSafe = Math.max(0.1, Math.min(10, q || 0.707));
  return Math.max(0.08, Math.min(0.40, 0.40 - ((qSafe - 0.1) / 9.9) * 0.30));
}

function buildSmoothPathByQ(points) {
  if (!points.length) return 'M 0 15 L 100 15';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const b0 = preampBands[p0.bandId];
    const b1 = preampBands[p1.bandId];
    const qAvg = ((b0?.q ?? 0.707) + (b1?.q ?? 0.707)) * 0.5;
    const t = qToTension(qAvg);
    const dx = p1.x - p0.x;
    const cp1x = p0.x + dx * t;
    const cp1y = p0.y;
    const cp2x = p1.x - dx * t;
    const cp2y = p1.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function buildEqResponsePath(activeBands) {
  const samples = 170;
  let d = '';
  for (let i = 0; i <= samples; i += 1) {
    const x = (i / samples) * 100;
    const freq = xToFreq(x);
    let gainSum = 0;
    activeBands.forEach((band) => {
      gainSum += bandResponseDb(band, freq);
    });
    const gainClamped = Math.max(DB_MIN, Math.min(DB_MAX, gainSum));
    const y = dbToY(gainClamped);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d;
}

function dbToY(db) {
  const c = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return ((DB_MAX - c) / (DB_MAX - DB_MIN)) * CHART_H;
}

function formatFreq(fc) {
  if (!fc) return '0Hz';
  if (fc >= 1000) {
    const k = fc / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}kHz`;
  }
  return `${Math.round(fc)}Hz`;
}

function updateDrcCurve() {
  const curve = drcCurve;
  if (!curve) return;
  const threshold = Number(document.getElementById('drc-threshold')?.value ?? -6);
  const ratio = Math.max(1, Number(document.getElementById('drc-ratio')?.value ?? 4));

  const inMin = -80;
  const inMax = 0;
  const outMin = -80;
  const outMax = 12;
  const n = 90;
  let pts = '';

  for (let i = 0; i <= n; i += 1) {
    const xDb = inMin + (i / n) * (inMax - inMin);
    const yDb = xDb <= threshold ? xDb : threshold + (xDb - threshold) / ratio;

    const px = 10 + ((xDb - inMin) / (inMax - inMin)) * 82;
    const py = 90 - ((yDb - outMin) / (outMax - outMin)) * 80;
    pts += i === 0 ? `${px},${py}` : ` ${px},${py}`;
  }

  curve.setAttribute('points', pts);
}

function sigmoid(v) {
  return 1 / (1 + Math.exp(-v));
}

function bandResponseDb(band, freq) {
  const type = String(band.type || 'PK').toUpperCase();
  const fs = getEqSampleRate();
  const maxFc = Math.min(getEqMaxFreq(), fs * 0.49);
  const fc = Math.max(20, Math.min(maxFc, Number(band.fc) || 1000));
  const q = Math.max(0.1, Math.min(10, Number(band.q) || 0.707));
  const gain = Math.max(DB_MIN, Math.min(DB_MAX, Number(band.gain) || 0));
  const w0 = (2 * Math.PI * fc) / fs;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * q);
  const A = 10 ** (gain / 40);
  const sqrtA = Math.sqrt(A);

  let b0; let b1; let b2; let a0; let a1; let a2;
  switch (type) {
    case 'LP':
      b0 = (1 - cosw0) * 0.5; b1 = 1 - cosw0; b2 = (1 - cosw0) * 0.5;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'HP':
      b0 = (1 + cosw0) * 0.5; b1 = -(1 + cosw0); b2 = (1 + cosw0) * 0.5;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'BP':
      // RBJ BPF with constant 0 dB peak gain.
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'NOTCH':
      b0 = 1; b1 = -2 * cosw0; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'LS':
      b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
      b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha);
      a0 = (A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosw0);
      a2 = (A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha;
      break;
    case 'HS':
      b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha);
      a0 = (A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      a2 = (A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha;
      break;
    case 'PK':
    default:
      b0 = 1 + alpha * A; b1 = -2 * cosw0; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cosw0; a2 = 1 - alpha / A;
      break;
  }

  const w = (2 * Math.PI * freq) / fs;
  const c1 = Math.cos(w); const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w); const s2 = Math.sin(2 * w);

  const numRe = b0 + b1 * c1 + b2 * c2;
  const numIm = -(b1 * s1 + b2 * s2);
  const denRe = a0 + a1 * c1 + a2 * c2;
  const denIm = -(a1 * s1 + a2 * s2);

  const num2 = numRe * numRe + numIm * numIm;
  const den2 = denRe * denRe + denIm * denIm;
  const mag = Math.sqrt(num2 / Math.max(1e-20, den2));
  return 20 * Math.log10(Math.max(1e-8, mag));
}

function typeUsesGain(type) {
  const t = String(type || 'PK').toUpperCase();
  return t === 'PK' || t === 'LS' || t === 'HS';
}

function renderPreampRows(side = 'l') {
  const tableBody = getPreampTableBody(side);
  const bands = getPreampBands(side);
  if (!tableBody) return;
  const rows = bands
    .filter((b) => b.active)
    .map((b) => `
      <div class="eq-table-row" data-row-band="${b.id}">
        <div class="eq-cell eq-cell-band">
          <span class="eq-cell-label">Band</span>
          <span class="eq-cell-value">F${b.id}</span>
        </div>
        <label class="eq-cell">
          <span class="eq-cell-label">Type</span>
          <select data-field="type" data-band="${b.id}">
            <option value="LP" ${b.type === 'LP' ? 'selected' : ''}>LP</option>
            <option value="HP" ${b.type === 'HP' ? 'selected' : ''}>HP</option>
            <option value="BP" ${b.type === 'BP' ? 'selected' : ''}>BP</option>
            <option value="NOTCH" ${b.type === 'NOTCH' ? 'selected' : ''}>NOTCH</option>
            <option value="PK" ${b.type === 'PK' ? 'selected' : ''}>PK</option>
            <option value="LS" ${b.type === 'LS' ? 'selected' : ''}>LS</option>
            <option value="HS" ${b.type === 'HS' ? 'selected' : ''}>HS</option>
          </select>
        </label>
        <label class="eq-cell">
          <span class="eq-cell-label">Fc</span>
          <input data-field="fc" data-band="${b.id}" type="number" min="20" max="20000" value="${b.fc}">
        </label>
        <label class="eq-cell">
          <span class="eq-cell-label">Gain</span>
          <input data-field="gain" data-band="${b.id}" type="number" step="0.1" min="-12" max="12" value="${b.gain.toFixed(1)}" ${typeUsesGain(b.type) ? '' : 'disabled'}>
        </label>
        <label class="eq-cell">
          <span class="eq-cell-label">Q</span>
          <input data-field="q" data-band="${b.id}" type="number" step="0.001" min="0.100" max="10.000" value="${b.q.toFixed(3)}">
        </label>
      </div>
    `).join('');
  tableBody.innerHTML = rows;
}

function syncBandChipUI(side = 'l') {
  const chips = getPreampBandChips(side);
  const bands = getPreampBands(side);
  chips.forEach((chip) => {
    const idx = Number(chip.dataset.band);
    const band = bands[idx];
    chip.classList.toggle('active', !!band?.active);
  });
}

function updatePreampRowFields(side, bandId) {
  const tableBody = getPreampTableBody(side);
  const bands = getPreampBands(side);
  if (!tableBody) return;
  const band = bands[bandId];
  if (!band) return;
  const fcInput = tableBody.querySelector(`input[data-field="fc"][data-band="${bandId}"]`);
  const gainInput = tableBody.querySelector(`input[data-field="gain"][data-band="${bandId}"]`);
  if (fcInput) fcInput.value = String(band.fc);
  if (gainInput) gainInput.value = String(band.gain.toFixed(1));
}

if (btnSave) {
  btnSave.addEventListener('click', async () => {
    if (!connected || btnSave.disabled) return;
    btnSave.disabled = true;
    setTxStatus('đang lưu MCU...', 'warn');
    appendRxLog('SAVE_CONFIG requested by user');
    if (saveAckTimer) clearTimeout(saveAckTimer);
    saveAckTimer = setTimeout(() => {
      saveAckTimer = null;
      btnSave.disabled = false;
      setTxStatus('lưu timeout', 'bad');
      appendRxLog('SAVE_CONFIG timeout: no MCU ACK');
    }, 5000);
    await sendTx('save');
  });
}

if (btnBleToggle) {
  btnBleToggle.addEventListener('click', async () => {
    if (bleConnecting) return;
    if (connected) {
      disconnectBleWeb();
      return;
    }
    await connectBleWeb();
  });
}

if (btnLogClear) {
  btnLogClear.addEventListener('click', () => {
    clearRxLog();
    appendRxLog('Người dùng đã xóa nhật ký');
  });
}

if (kcModeSelect) {
  kcModeSelect.addEventListener('change', () => {
    const mode = Math.max(0, Math.min(2, Number(kcModeSelect.value) || 0));
    sendTx(`kc-mode_${mode}`);
  });
}

if (btnResetDefaults) {
  btnResetDefaults.addEventListener('click', async () => {
    if (!connected || btnResetDefaults.disabled) {
      setTxStatus('chưa kết nối', 'bad');
      return;
    }
    const accepted = window.confirm(
      'Đưa toàn bộ thông số DSP và chế độ KC về mặc định? Tên thiết bị sẽ được giữ nguyên.'
    );
    if (!accepted) return;

    btnResetDefaults.disabled = true;
    setTxStatus('đang khôi phục mặc định...', 'warn');
    appendRxLog('Yêu cầu khôi phục cấu hình DSP mặc định');
    if (resetAckTimer) clearTimeout(resetAckTimer);
    resetAckTimer = setTimeout(() => {
      resetAckTimer = null;
      btnResetDefaults.disabled = false;
      setTxStatus('reset quá thời gian chờ', 'bad');
      appendRxLog('Không nhận được ACK cho lệnh khôi phục mặc định');
    }, 5000);
    await sendTx('reset-defaults');
  });
}

window.pushChipRxLog = (payload) => {
  if (payload == null) {
    appendRxLog('RX (null)');
    return;
  }
  if (typeof payload === 'string') {
    appendRxLog(`RX ${payload}`);
    return;
  }
  try {
    appendRxLog(`RX ${JSON.stringify(payload)}`);
  } catch (_) {
    appendRxLog('RX [unserializable payload]');
  }
};

window.clearChipRxLog = () => clearRxLog();

async function applyMusicEqPreset(presetId) {
  const preset = MUSIC_EQ_PRESETS[presetId];
  if (!preset) return;
  if (eqPresetSel) eqPresetSel.disabled = true;
  const frequencies = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
  const updateSide = (bands) => {
    bands.forEach((band, index) => {
      band.active = true;
      band.type = index === 0 ? 'LS' : (index === 8 ? 'HS' : 'PK');
      band.fc = frequencies[index];
      band.gain = preset.gains[index];
      band.q = 0.707;
    });
  };

  updateSide(preampBands);
  updateSide(preampBandsR);
  ['l', 'r'].forEach((side) => {
    syncBandChipUI(side);
    renderPreampRows(side);
    renderEqLine(side);
  });

  appendRxLog(`Preset EQ: ${preset.name}`);
  if (!connected) {
    if (eqPresetSel) eqPresetSel.disabled = false;
    setTxStatus('preset đã chọn, chưa kết nối', 'warn');
    return;
  }

  setTxStatus('đang áp dụng preset...', 'warn');
  /* sendTx tự nối hàng đợi BLE, nên 18 gói không bị ghi chồng lên nhau. */
  try {
    for (const side of ['l', 'r']) {
      for (let band = 0; band < 9; band += 1) {
        const prefix = side === 'l' ? '' : 'r_';
        await sendTx(`band_${prefix}F${band}_preset`);
      }
    }
    setTxStatus('preset EQ đã áp dụng', 'ok');
  } finally {
    if (eqPresetSel) eqPresetSel.disabled = false;
  }
}

if (eqPresetSel) {
  eqPresetSel.addEventListener('change', () => {
    applyMusicEqPreset(eqPresetSel.value);
  });
}

function bindPreampChipEvents(side, chips) {
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const idx = Number(chip.dataset.band);
      const bands = getPreampBands(side);
      const band = bands[idx];
      if (!band) return;
      band.active = !band.active;
      syncBandChipUI(side);
      renderPreampRows(side);
      renderEqLine(side);
      sendTx(`band_${getSideTxPrefix(side)}F${idx}_${band.active ? 'on' : 'off'}`);
    });
  });
}

bindPreampChipEvents('l', preampBandChipsL);
bindPreampChipEvents('r', preampBandChipsR);
bindPreampChipEvents('sub', preampBandChipsSub);
bindPreampChipEvents('mic1', preampBandChipsMic1);
bindPreampChipEvents('mic2', preampBandChipsMic2);

function bindPreampTableEvents(side, tableBody) {
  if (!tableBody) return;
  tableBody.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const bandId = Number(target.getAttribute('data-band'));
    const field = target.getAttribute('data-field');
    const bands = getPreampBands(side);
    const band = bands[bandId];
    if (!band || !field) return;

    if (field === 'type' && target instanceof HTMLSelectElement) {
      band.type = target.value;
      if (!typeUsesGain(band.type)) band.gain = 0;
    }
    if (field === 'fc' && target instanceof HTMLInputElement) {
      const v = Number(String(target.value).replace(',', '.'));
      if (!Number.isNaN(v)) band.fc = Math.max(20, Math.min(20000, Math.round(v)));
    }
    if (field === 'gain' && target instanceof HTMLInputElement) {
      if (!typeUsesGain(band.type)) {
        band.gain = 0;
      } else {
      const v = Number(String(target.value).replace(',', '.'));
      if (!Number.isNaN(v)) band.gain = Math.max(DB_MIN, Math.min(DB_MAX, v));
      }
    }
    if (field === 'q' && target instanceof HTMLInputElement) {
      const v = Number(String(target.value).replace(',', '.'));
      if (!Number.isNaN(v)) band.q = Math.max(0.1, Math.min(10, v));
    }

    renderEqLine(side);
    renderPreampRows(side);
    updatePreampRowFields(side, bandId);
    sendTx(`band_${getSideTxPrefix(side)}F${bandId}_${field}_${target.value}`);
  });
}

bindPreampTableEvents('l', preampTableBodyL);
bindPreampTableEvents('r', preampTableBodyR);
bindPreampTableEvents('sub', preampTableBodySub);
bindPreampTableEvents('mic1', preampTableBodyMic1);
bindPreampTableEvents('mic2', preampTableBodyMic2);

const onEqDragMove = (event) => {
  if (!isDragging || draggingBandId === null || !draggingSide) return;
  const svg = getEqSvg(draggingSide);
  if (!svg) return;
  const bands = getPreampBands(draggingSide);
  const band = bands[draggingBandId];
  if (!band || !band.active) return;
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 30;
  band.fc = xToFreq(x);
  if (typeUsesGain(band.type)) {
    band.gain = yToGain(y);
  } else {
    band.gain = 0;
  }
  renderEqLine(draggingSide);
  updatePreampRowFields(draggingSide, draggingBandId);
  setTxStatus('DRAG EQ', 'ok');
  event.preventDefault();
};

const stopEqDrag = () => {
  if (!isDragging || draggingBandId === null || !draggingSide) return;
  sendTx(`drag_${getSideTxPrefix(draggingSide)}F${draggingBandId}_ok`);
  const side = draggingSide;
  draggingBandId = null;
  draggingSide = null;
  isDragging = false;
  setDragScrollLock(false);
  document.querySelectorAll(`#eq-points-${side} circle.dragging`).forEach((c) => c.classList.remove('dragging'));
};

function bindEqDrag(side, svg) {
  if (!svg) return;
  svg.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof SVGCircleElement)) return;
    const bandId = Number(target.getAttribute('data-band'));
    if (Number.isNaN(bandId)) return;
    draggingBandId = bandId;
    draggingSide = side;
    isDragging = true;
    target.classList.add('dragging');
    setDragScrollLock(true);
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
}

bindEqDrag('l', eqSvgL);
bindEqDrag('r', eqSvgR);
bindEqDrag('sub', eqSvgSub);
bindEqDrag('mic1', eqSvgMic1);
bindEqDrag('mic2', eqSvgMic2);
window.addEventListener('pointermove', onEqDragMove, { passive: false });
window.addEventListener('pointerup', stopEqDrag);
window.addEventListener('pointercancel', stopEqDrag);

document.querySelectorAll('input[type="range"]').forEach((slider) => {
  slider.addEventListener('pointerdown', () => setDragScrollLock(true));
  slider.addEventListener('pointerup', () => setDragScrollLock(false));
  slider.addEventListener('pointercancel', () => setDragScrollLock(false));
});
window.addEventListener('pointerup', () => {
  if (!isDragging) setDragScrollLock(false);
});
window.addEventListener('pointercancel', () => {
  if (!isDragging) setDragScrollLock(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    setDragScrollLock(false);
    clearBleReconnectTimer();
    return;
  }
  if (bleDevice?.gatt?.connected && connected && bleTxCharacteristic) {
    appendRxLog('BLE link still active after app resume');
    return;
  }
  resumeBleConnection('reconnected after app resume');
});

if (btNameInput) {
  btNameInput.addEventListener('change', () => {
    const name = btNameInput.value.trim();
    btNameInput.value = name;
    sendTx(`bt_name_${name}`);
    if (chipDevice && name) chipDevice.textContent = name;
  });
}

if (bleNameInput) {
  bleNameInput.addEventListener('change', () => {
    const name = bleNameInput.value.trim();
    bleNameInput.value = name;
    sendTx(`ble_name_${name}`);
  });
}

document.querySelectorAll('.eq-band').forEach((el) => {
  el.addEventListener('input', () => {
    renderEqLine(el.dataset.eqTarget);
  });
  el.addEventListener('change', () => {
    sendTx(`eq_${el.dataset.eqTarget}_${el.value}`);
  });
});

const dynamicEqThresholdControls = [
  document.getElementById('dyn-th-low'),
  document.getElementById('dyn-th-normal'),
  document.getElementById('dyn-th-high'),
].filter(Boolean);
syncDynamicEqThresholdLimits();
dynamicEqThresholdControls.forEach((control) => {
  control.addEventListener('input', () => syncDynamicEqThresholdLimits(control));
  control.addEventListener('change', () => syncDynamicEqThresholdLimits(control));
});

document.querySelectorAll('input[type="range"]:not(.eq-band), select').forEach((el) => {
  el.addEventListener('change', () => {
    const key = `${el.id || el.tagName}:${el.value}`;
    sendTx(key);
  });
});

function syncSubPhaseUI(phaseDeg) {
  if (!subPhaseToggle) return;
  const is180 = Number(phaseDeg) === 180;
  subPhaseToggle.dataset.phase = is180 ? '180' : '0';
  subPhaseToggle.setAttribute('aria-pressed', is180 ? 'true' : 'false');
  subPhaseToggle.querySelector('.phase-label-0')?.classList.toggle('is-active', !is180);
  subPhaseToggle.querySelector('.phase-label-180')?.classList.toggle('is-active', is180);
  if (subPhaseState) subPhaseState.textContent = `Hiện tại: ${is180 ? '180°' : '0°'}`;
}

function syncSubModeUI(mode) {
  if (!subModeToggle) return;
  const isMono = String(mode).toLowerCase() === 'mono';
  subModeToggle.dataset.mode = isMono ? 'mono' : 'stereo';
  subModeToggle.setAttribute('aria-pressed', isMono ? 'true' : 'false');
  subModeToggle.querySelector('.mode-label-stereo')?.classList.toggle('is-active', !isMono);
  subModeToggle.querySelector('.mode-label-mono')?.classList.toggle('is-active', isMono);
  if (subModeState) subModeState.textContent = `Hiện tại: ${isMono ? 'MONO' : 'STEREO'}`;
}

if (subModeToggle) {
  syncSubModeUI(subModeToggle.dataset.mode || 'mono');
  subModeToggle.addEventListener('click', () => {
    const current = String(subModeToggle.dataset.mode || 'mono').toLowerCase();
    const next = current === 'mono' ? 'stereo' : 'mono';
    syncSubModeUI(next);
    sendTx(`sub_mode_${next}`);
  });
}

if (subPhaseToggle) {
  syncSubPhaseUI(Number(subPhaseToggle.dataset.phase || '0'));
  subPhaseToggle.addEventListener('click', () => {
    const current = Number(subPhaseToggle.dataset.phase || '0');
    const next = current === 0 ? 180 : 0;
    syncSubPhaseUI(next);
    sendTx(`sub_phase_${next}`);
  });
}

if (micAfbToggle) {
  micAfbToggle.addEventListener('click', () => {
    const nextOn = micAfbToggle.getAttribute('aria-pressed') !== 'true';
    micAfbToggle.setAttribute('aria-pressed', nextOn ? 'true' : 'false');
    sendTx('afb-sync');
  });
}

if (dynEqToggle) {
  dynEqToggle.addEventListener('click', () => {
    const nextOn = dynEqToggle.getAttribute('aria-pressed') !== 'true';
    dynEqToggle.setAttribute('aria-pressed', nextOn ? 'true' : 'false');
    sendTx('dyn-sync');
  });
}

if (drcToggle) {
  drcToggle.addEventListener('click', () => {
    const nextOn = drcToggle.getAttribute('aria-pressed') !== 'true';
    drcToggle.setAttribute('aria-pressed', nextOn ? 'true' : 'false');
    sendTx('drc-sync');
  });
}

function bindDrcEvents(params) {
  params.forEach((el) => {
    el.addEventListener('input', () => {
      updateDrcCurve();
    });
    el.addEventListener('change', () => {
      updateDrcCurve();
      sendTx('drc-sync');
    });
  });
}

bindDrcEvents(drcParams);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (isRunningAsInstalledApp()) {
    hidePwaBar();
    return;
  }
  deferredInstallPrompt = event;
  pwaBarClosedByUser = false;
  localStorage.removeItem(PWA_BAR_CLOSED_KEY);
  showPwaBar();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hidePwaBar();
});

if (btnPwaInstall) {
  btnPwaInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!secure) {
        alert('PWA chi ho tro tren HTTPS hoac localhost.');
      } else {
        alert('Trinh duyet chua cho phep Install Prompt. Thu reload trang, hoac vao menu trinh duyet -> Save and share -> Install page as app.');
      }
      return;
    }
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (_) {
      // no-op
    }
    deferredInstallPrompt = null;
    hidePwaBar();
  });
}

if (btnPwaClose) {
  btnPwaClose.addEventListener('click', () => {
    pwaBarClosedByUser = true;
    localStorage.setItem(PWA_BAR_CLOSED_KEY, '1');
    hidePwaBar();
  });
}

if (isRunningAsInstalledApp()) {
  hidePwaBar();
}
window.addEventListener('pageshow', () => {
  if (isRunningAsInstalledApp()) hidePwaBar();
  resumeBleConnection('reconnected after page resume');
});

renderEqLine('l');
renderEqLine('r');
renderEqLine('sub');
renderEqLine('mic1');
renderEqLine('mic2');
renderPreampRows('l');
renderPreampRows('r');
renderPreampRows('sub');
renderPreampRows('mic1');
renderPreampRows('mic2');
syncBandChipUI('l');
syncBandChipUI('r');
syncBandChipUI('sub');
syncBandChipUI('mic1');
syncBandChipUI('mic2');
updateDrcCurve();
setConnUI();
setBleToggleUI();
setBleLinkState('Chưa kết nối BLE Web', 'bad');
appendRxLog('Giao diện đã sẵn sàng. Đang chờ dữ liệu BLE từ thiết bị...');
initRangeLiveValues();
applyHardwareVolumeOwnership();
renderFreqAxis('l');
renderFreqAxis('r');
renderFreqAxis('sub');
renderFreqAxis('mic1');
renderFreqAxis('mic2');
renderEqLine('l');
renderEqLine('r');
renderEqLine('sub');
renderEqLine('mic1');
renderEqLine('mic2');
renderPreampRows('l');
renderPreampRows('r');
renderPreampRows('sub');
renderPreampRows('mic1');
renderPreampRows('mic2');




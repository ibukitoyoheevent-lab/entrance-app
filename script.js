// 入場管理アプリのメイン設定
const CONFIG = {
  GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx5M1F8vLTzURCoMUN1Op3SGmxAvtpaJCkJmg9a5qgRbIFkgPaAvRJP6oH3AC2KrUlr/exec',
  STORAGE_KEY: 'entryManagementData',
  CUSTOMER_STORAGE_KEY: 'customerData',
  CAMERA_PREFERENCE: 'environment',
  PREFER_ONLINE_DATA: true,
  FALLBACK_SAMPLE_DATA: false,
  CAMERA_TIMEOUT: 10000 // 10秒でタイムアウト
};

// グローバル変数
let html5QrCode = null;
let customerData = [];
let entryData = [];
let isScanning = false;
let isPaused = false;
let continuousScanMode = true;
let cameraInitialized = false;
let processedCustomers = new Set();
let currentCustomer = null;
let currentCameraIndex = 0;
let availableCamerasList = [];
let cameraStartTimeout = null;

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ 入場管理アプリが読み込まれました');
  
  // 初期データ読み込み
  loadStoredData();
  updateStats();
  
  // イベントリスナー設定（1回のみ）
  setupEventListeners();
  
  // 初回データ読み込み
  if (CONFIG.PREFER_ONLINE_DATA) {
    fetchCustomerData().then(success => {
      if (success) {
        console.log('🌐 初回オンラインデータ取得完了');
      } else {
        console.log('📱 オフラインデータで動作中');
      }
    });
  }
});

// ==========================================
// 画面管理
// ==========================================

function showScreen(screenId) {
  console.log('画面切り替え:', screenId);
  
  const screens = [
    'mainScreen', 'qrScanScreen', 'manualEntryScreen', 
    'customerInfoScreen', 'completionScreen', 'dataMenuScreen', 
    'customerListScreen', 'entryListScreen'
  ];
  
  screens.forEach(id => {
    const screen = document.getElementById(id);
    if (screen) {
      screen.classList.add('hidden');
    }
  });
  
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.remove('hidden');
  }
}

function showLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.remove('hidden');
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
}

// ==========================================
// データ管理
// ==========================================

async function fetchCustomerData() {
  if (!CONFIG.PREFER_ONLINE_DATA) {
    console.log('オフラインモード設定のため、スキップ');
    return false;
  }
  
  try {
    showLoading();
    console.log('📡 Google Sheetsからオンラインデータを取得中...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL + '?action=getCustomers', {
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.customers && data.customers.length > 0) {
      customerData = data.customers;
      localStorage.setItem(CONFIG.CUSTOMER_STORAGE_KEY, JSON.stringify(customerData));
      console.log(`✅ ${customerData.length}件の顧客データをオンライン取得しました`);
      updateStats();
      return true;
    } else {
      throw new Error('有効な顧客データが見つかりませんでした');
    }
  } catch (error) {
    console.error('❌ オンラインデータ取得エラー:', error);
    
    if (CONFIG.FALLBACK_SAMPLE_DATA) {
      customerData = [
        { ticketNumber: '634', name: 'テスト 太郎', email: 'test1@example.com', ticketCount: 2, seatNumber: 'A-12' },
        { ticketNumber: '183', name: 'サンプル 花子', email: 'test2@example.com', ticketCount: 1, seatNumber: 'B-05' },
        { ticketNumber: '631', name: 'デモ 次郎', email: 'test3@example.com', ticketCount: 3, seatNumber: 'C-08' }
      ];
      localStorage.setItem(CONFIG.CUSTOMER_STORAGE_KEY, JSON.stringify(customerData));
      alert('⚠️ オンラインデータ取得に失敗しました\nサンプルデータを使用します');
      updateStats();
      return false;
    } else {
      alert('❌ オンラインデータの取得に失敗しました\nオフラインデータを使用します');
      return false;
    }
  } finally {
    hideLoading();
  }
}

function loadStoredData() {
  const storedCustomers = localStorage.getItem(CONFIG.CUSTOMER_STORAGE_KEY);
  const storedEntries = localStorage.getItem(CONFIG.STORAGE_KEY);
  
  if (storedCustomers) {
    customerData = JSON.parse(storedCustomers);
    console.log(`📁 保存済み顧客データ: ${customerData.length}件`);
  }
  
  if (storedEntries) {
    entryData = JSON.parse(storedEntries);
    entryData.forEach(entry => {
      processedCustomers.add(entry.ticketNumber);
    });
    console.log(`📁 保存済み入場記録: ${entryData.length}件`);
  }
}

function updateStats() {
  const entryCountElement = document.getElementById('entryCount');
  const totalTicketsElement = document.getElementById('totalTickets');
  
  const totalEntries = entryData.reduce((sum, entry) => sum + (entry.entryCount || 1), 0);
  const totalTickets = customerData.reduce((sum, customer) => sum + (customer.ticketCount || 1), 0);
  
  if (entryCountElement) entryCountElement.textContent = totalEntries;
  if (totalTicketsElement) totalTicketsElement.textContent = totalTickets;
}

async function saveEntry(customer, entryCount) {
  const entry = {
    ticketNumber: customer.ticketNumber,
    customerName: customer.name,
    entryCount: parseInt(entryCount),
    entryTime: new Date().toISOString(),
    timestamp: Date.now()
  };
  
  // ローカル保存
  entryData.push(entry);
  processedCustomers.add(customer.ticketNumber);
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(entryData));
  updateStats();
  
  // Google Sheetsに送信
  if (CONFIG.PREFER_ONLINE_DATA) {
    try {
      console.log('📤 Google Sheetsに入場記録を送信中...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          action: 'addEntry',
          ticketNumber: entry.ticketNumber,
          customerName: entry.customerName,
          entryCount: entry.entryCount,
          entryTime: entry.entryTime,
          timestamp: entry.timestamp
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const result = await response.json();
      if (result.success) {
        console.log('✅ 入場記録をGoogle Sheetsに保存しました');
      } else {
        console.warn('⚠️ Google Sheets保存で警告:', result.error);
      }
    } catch (error) {
      console.error('❌ Google Sheets保存エラー:', error);
    }
  }
  
  return entry;
}

// ==========================================
// QRコードスキャン（タイムアウト付き高速版）
// ==========================================

async function startQRScanner() {
  console.log('🎥 QRスキャナー開始');
  
  // 既存のタイムアウトをクリア
  if (cameraStartTimeout) {
    clearTimeout(cameraStartTimeout);
  }
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qrReader");
  }
  
  const qrReaderElement = document.getElementById('qrReader');
  if (qrReaderElement) {
    qrReaderElement.classList.remove('camera-ready');
  }
  
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 250 }
  };
  
  updateScanStatus('カメラ起動中...', 'scanning');
  
  // タイムアウト設定
  const timeoutPromise = new Promise((_, reject) => {
    cameraStartTimeout = setTimeout(() => {
      reject(new Error('CAMERA_TIMEOUT'));
    }, CONFIG.CAMERA_TIMEOUT);
  });
  
  try {
    // タイムアウト付きでカメラ起動
    await Promise.race([
      startCameraWithFallback(config),
      timeoutPromise
    ]);
    
    // 成功
    clearTimeout(cameraStartTimeout);
    console.log('✅ カメラ起動成功');
    
    if (qrReaderElement) qrReaderElement.classList.add('camera-ready');
    isScanning = true;
    cameraInitialized = true;
    updateScanStatus('QRコードをカメラに向けてください', 'scanning');
    showFlipCameraButton();
    
  } catch (error) {
    clearTimeout(cameraStartTimeout);
    console.error('❌ カメラ起動失敗:', error);
    
    if (qrReaderElement) qrReaderElement.classList.remove('camera-ready');
    updateScanStatus('カメラの起動に失敗しました', 'error');
    
    if (error.message === 'CAMERA_TIMEOUT') {
      alert(
        '⏱️ カメラの起動がタイムアウトしました\n\n' +
        '【対処法】\n' +
        '1. 他のアプリがカメラを使用していないか確認\n' +
        '2. ページを再読み込み\n' +
        '3. デバイスを再起動\n\n' +
        '※ 手動入力で代替できます'
      );
    } else {
      showCameraError(error);
    }
  }
}

// カメラ起動のフォールバック処理
async function startCameraWithFallback(config) {
  // 方法1: facingMode指定
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    );
    console.log('✅ facingModeで起動成功');
    return;
  } catch (e) {
    console.log('⚠️ facingMode失敗:', e.message);
  }
  
  // 方法2: カメラリストから選択
  try {
    const cameras = await Html5Qrcode.getCameras();
    console.log('📷 利用可能なカメラ:', cameras.length, '台');
    
    if (cameras.length === 0) {
      throw new Error('カメラが見つかりませんでした');
    }
    
    availableCamerasList = cameras;
    
    // 外カメラを探す
    let selectedCamera = cameras[cameras.length - 1];
    let selectedIndex = cameras.length - 1;
    
    const rearKeywords = ['back', 'rear', 'environment', '背面', 'リア'];
    const rearIndex = cameras.findIndex(cam => {
      const label = (cam.label || '').toLowerCase();
      return rearKeywords.some(kw => label.includes(kw));
    });
    
    if (rearIndex !== -1) {
      selectedCamera = cameras[rearIndex];
      selectedIndex = rearIndex;
      console.log('✅ 外カメラ検出:', selectedCamera.label);
    }
    
    currentCameraIndex = selectedIndex;
    
    await html5QrCode.start(
      selectedCamera.id,
      config,
      onScanSuccess,
      onScanFailure
    );
    
    console.log('✅ カメラリストから起動成功');
    return;
    
  } catch (e) {
    console.error('❌ カメラリスト取得失敗:', e);
    throw e;
  }
}

function showCameraError(error) {
  let errorMessage = 'カメラの起動に失敗しました。\n\n';
  
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    errorMessage += '【原因】カメラへのアクセスが拒否されています\n\n';
    errorMessage += '【対処法】\n';
    errorMessage += '1. ブラウザのカメラ権限を「許可」に設定\n';
    errorMessage += '2. ページを再読み込み\n\n';
    errorMessage += '※ 手動入力で代替できます';
  } else if (error.name === 'NotFoundError') {
    errorMessage += '【原因】カメラが見つかりませんでした\n\n';
    errorMessage += '【対処法】\n';
    errorMessage += '1. 他のアプリを終了\n';
    errorMessage += '2. デバイスを再起動\n\n';
    errorMessage += '※ 手動入力で代替できます';
  } else {
    errorMessage += '【対処法】\n';
    errorMessage += '1. ページを再読み込み\n';
    errorMessage += '2. ブラウザを再起動\n\n';
    errorMessage += '※ 手動入力で代替できます\n\n';
    errorMessage += `エラー: ${error.message}`;
  }
  
  alert(errorMessage);
}

async function showFlipCameraButton() {
  try {
    if (availableCamerasList.length > 1) {
      const flipBtn = document.getElementById('flipCameraBtn');
      if (flipBtn) {
        flipBtn.style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('ボタン表示エラー:', error);
  }
}

async function flipCamera() {
  try {
    if (availableCamerasList.length < 2) {
      alert('切り替え可能なカメラがありません');
      return;
    }
    
    if (html5QrCode && isScanning) {
      await html5QrCode.stop();
      isScanning = false;
    }
    
    currentCameraIndex = (currentCameraIndex + 1) % availableCamerasList.length;
    const nextCamera = availableCamerasList[currentCameraIndex];
    
    console.log('🔄 カメラ切り替え:', nextCamera.label);
    
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    };
    
    await html5QrCode.start(
      nextCamera.id,
      config,
      onScanSuccess,
      onScanFailure
    );
    
    isScanning = true;
    updateScanStatus('カメラ切り替え完了', 'success');
    
    setTimeout(() => {
      if (isScanning && !isPaused) {
        updateScanStatus('QRコードをカメラに向けてください', 'scanning');
      }
    }, 2000);
    
  } catch (error) {
    console.error('❌ カメラ切り替えエラー:', error);
    alert('カメラ切り替えに失敗しました');
  }
}

function onScanSuccess(decodedText, decodedResult) {
  console.log('✅ QRコード読み取り成功:', decodedText);
  
  if (isPaused) return;
  
  updateScanStatus('QRコードを読み取りました', 'success');
  
  const customer = findCustomer(decodedText);
  if (customer) {
    currentCustomer = customer;
    displayCustomerInfo(customer);
    showScreen('customerInfoScreen');
    
    if (!continuousScanMode) {
      pauseQRScanner();
    }
  } else {
    updateScanStatus('該当する顧客が見つかりませんでした', 'error');
    setTimeout(() => {
      if (isScanning && !isPaused) {
        updateScanStatus('QRコードをカメラに向けてください', 'scanning');
      }
    }, 2000);
  }
}

function onScanFailure(error) {
  // エラーメッセージは表示しない（通常の動作）
}

function updateScanStatus(message, type = '') {
  const statusElement = document.getElementById('qrScanStatus');
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = 'scan-status ' + type;
  }
}

function pauseQRScanner() {
  if (html5QrCode && isScanning && !isPaused) {
    html5QrCode.pause();
    isPaused = true;
    updateScanStatus('スキャンを一時停止しました', 'paused');
    console.log('⏸️ QRスキャナー一時停止');
  }
}

function resumeQRScanner() {
  if (html5QrCode && isScanning && isPaused) {
    html5QrCode.resume();
    isPaused = false;
    updateScanStatus('QRコードをカメラに向けてください', 'scanning');
    console.log('▶️ QRスキャナー再開');
  }
}

function stopQRScanner() {
  if (html5QrCode && isScanning) {
    html5QrCode.stop().then(() => {
      console.log('⏹️ QRスキャナー停止');
      isScanning = false;
      isPaused = false;
      cameraInitialized = false;
      
      const flipBtn = document.getElementById('flipCameraBtn');
      if (flipBtn) {
        flipBtn.style.display = 'none';
      }
    }).catch(err => {
      console.error('QRスキャナー停止エラー:', err);
    });
  }
  
  // タイムアウトもクリア
  if (cameraStartTimeout) {
    clearTimeout(cameraStartTimeout);
  }
}

// ==========================================
// 顧客情報管理
// ==========================================

function findCustomer(query) {
  return customerData.find(customer => 
    customer.ticketNumber === query || 
    customer.name.includes(query) || 
    customer.email.includes(query)
  );
}

function displayCustomerInfo(customer) {
  currentCustomer = customer;
  
  document.getElementById('customerTicket').textContent = customer.ticketNumber || '-';
  document.getElementById('customerName').textContent = customer.name || '-';
  document.getElementById('customerEmail').textContent = customer.email || '-';
  document.getElementById('customerTickets').textContent = customer.ticketCount || '-';
  document.getElementById('customerSeat').textContent = customer.seatNumber || '-';
  
  const entryHistory = entryData.filter(entry => entry.ticketNumber === customer.ticketNumber);
  const historyElement = document.getElementById('entryHistory');
  const historyListElement = document.getElementById('entryHistoryList');
  
  if (entryHistory.length > 0) {
    historyElement.classList.remove('hidden');
    historyListElement.innerHTML = entryHistory.map(entry =>
      `<p><strong>${new Date(entry.entryTime).toLocaleString('ja-JP')}</strong> - ${entry.entryCount}名</p>`
    ).join('');
  } else {
    historyElement.classList.add('hidden');
  }
}

// ==========================================
// データ表示
// ==========================================

function displayCustomerList() {
  const customerList = document.getElementById('customerList');
  const customerListStats = document.getElementById('customerListStats');
  
  if (!customerList || !customerListStats) return;
  
  const enteredCount = customerData.filter(customer => 
    processedCustomers.has(customer.ticketNumber)
  ).length;
  
  customerListStats.textContent = `全${customerData.length}件中 ${enteredCount}件入場済み`;
  
  if (customerData.length === 0) {
    customerList.innerHTML = '<div class="no-data">📋 顧客データがありません<br>「データ更新」ボタンで最新データを取得してください</div>';
    return;
  }
  
  customerList.innerHTML = customerData.map(customer => {
    const isEntered = processedCustomers.has(customer.ticketNumber);
    return `
      <div class="list-item">
        <div class="list-item-header">
          <span class="customer-name">${customer.name}</span>
          <span class="entry-status ${isEntered ? 'entered' : 'pending'}">
            ${isEntered ? '✅ 入場済み' : '⏳ 未入場'}
          </span>
        </div>
        <div class="list-item-details">
          チケット番号: ${customer.ticketNumber}<br>
          メール: ${customer.email}<br>
          購入枚数: ${customer.ticketCount}枚 | 座席: ${customer.seatNumber}
        </div>
      </div>
    `;
  }).join('');
}

function displayEntryList() {
  const entryList = document.getElementById('entryList');
  const entryListStats = document.getElementById('entryListStats');
  
  if (!entryList || !entryListStats) return;
  
  const totalEntries = entryData.reduce((sum, entry) => sum + (entry.entryCount || 1), 0);
  entryListStats.textContent = `全${entryData.length}件の記録 (入場者数: ${totalEntries}名)`;
  
  if (entryData.length === 0) {
    entryList.innerHTML = '<div class="no-data">📋 入場記録がありません</div>';
    return;
  }
  
  const sortedEntries = [...entryData].reverse();
  
  entryList.innerHTML = sortedEntries.map(entry => `
    <div class="list-item">
      <div class="list-item-header">
        <span class="customer-name">${entry.customerName}</span>
        <span class="entry-status entered">${entry.entryCount}名</span>
      </div>
      <div class="list-item-details">
        チケット番号: ${entry.ticketNumber}<br>
        入場時刻: ${new Date(entry.entryTime).toLocaleString('ja-JP')}
      </div>
    </div>
  `).join('');
}

function exportToCSV() {
  if (entryData.length === 0) {
    alert('❌ エクスポートする入場記録がありません');
    return;
  }
  
  const headers = ['チケット番号', '顧客名', '入場人数', '入場時刻'];
  const csvContent = [
    headers.join(','),
    ...entryData.map(entry => [
      entry.ticketNumber,
      entry.customerName,
      entry.entryCount,
      new Date(entry.entryTime).toLocaleString('ja-JP')
    ].join(','))
  ].join('\n');
  
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `入場記録_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  alert('✅ CSVファイルをダウンロードしました');
}

// ==========================================
// イベントリスナー設定（重複登録防止）
// ==========================================

let listenersSetup = false;

function setupEventListeners() {
  if (listenersSetup) {
    console.log('⚠️ イベントリスナーは既に設定済みです');
    return;
  }
  
  console.log('🔧 イベントリスナー設定中...');
  
  // メイン画面
  addClickListener('startQRScan', () => {
    console.log('📷 QRスキャン画面へ');
    showScreen('qrScanScreen');
    startQRScanner();
  });
  
  addClickListener('manualEntry', () => {
    console.log('📝 手動入力画面へ');
    showScreen('manualEntryScreen');
  });
  
  addClickListener('updateBtn', async () => {
    console.log('🔄 データ更新開始');
    const success = await fetchCustomerData();
    if (success) {
      alert('✅ オンラインデータを更新しました');
    }
  });
  
  addClickListener('menuBtn', () => {
    console.log('📋 データ管理メニューへ');
    showScreen('dataMenuScreen');
  });
  
  // QRスキャン画面
  addClickListener('stopQRScan', () => {
    console.log('⏹️ QRスキャン停止');
    stopQRScanner();
    showScreen('mainScreen');
  });
  
  addClickListener('pauseResumeBtn', function() {
    if (isPaused) {
      resumeQRScanner();
      this.innerHTML = '⏸️ 一時停止';
    } else {
      pauseQRScanner();
      this.innerHTML = '▶️ 再開';
    }
  });
  
  addClickListener('continuousModeBtn', function() {
    continuousScanMode = !continuousScanMode;
    this.innerHTML = continuousScanMode ? '🔄 連続スキャン: ON' : '🔄 連続スキャン: OFF';
  });
  
  addClickListener('switchToManual', () => {
    console.log('📝 手動入力へ切り替え');
    stopQRScanner();
    showScreen('manualEntryScreen');
  });
  
  addClickListener('flipCameraBtn', flipCamera);
  
  // 手動入力画面
  addClickListener('backToMain', () => {
    console.log('🏠 メイン画面へ戻る');
    showScreen('mainScreen');
  });
  
  addClickListener('searchButton', () => {
    console.log('🔍 顧客検索実行');
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.trim() : '';
    
    if (!query) {
      alert('🔍 検索キーワードを入力してください');
      return;
    }
    
    const customer = findCustomer(query);
    if (customer) {
      displayCustomerInfo(customer);
      showScreen('customerInfoScreen');
    } else {
      alert('❌ 該当する顧客が見つかりませんでした');
    }
  });
  
  // 顧客情報画面
  addClickListener('backToSearch', () => {
    console.log('🔙 検索画面へ戻る');
    showScreen('manualEntryScreen');
  });
  
  addClickListener('confirmEntry', async () => {
    console.log('✅ 入場確定処理開始');
    const entryCount = parseInt(document.getElementById('entryCountInput').value);
    
    if (!currentCustomer) {
      alert('❌ 顧客情報が取得できませんでした');
      return;
    }
    
    try {
      showLoading();
      await saveEntry(currentCustomer, entryCount);
      
      document.getElementById('completedCustomerName').textContent = currentCustomer.name;
      document.getElementById('completedTicketNumber').textContent = currentCustomer.ticketNumber;
      document.getElementById('completedTickets').textContent = entryCount;
      document.getElementById('entryTime').textContent = new Date().toLocaleString('ja-JP');
      
      showScreen('completionScreen');
    } catch (error) {
      console.error('入場処理エラー:', error);
      alert('❌ 入場処理中にエラーが発生しました');
    } finally {
      hideLoading();
    }
  });
  
  // 完了画面
　　addClickListener('nextCustomer', () => {
  console.log('➡️ 次の顧客へ - QRスキャン画面に戻る');
  showScreen('qrScanScreen');
  resumeQRScanner();
});

　　// または、さらに安全な版（カメラが停止している場合は再起動）
　　addClickListener('nextCustomer', () => {
  console.log('➡️ 次の顧客へ - QRスキャン画面に戻る');
  showScreen('qrScanScreen');
  
  // カメラが既に動いている場合は再開、停止している場合は再起動
  if (isScanning && isPaused) {
    resumeQRScanner();
  } else if (!isScanning) {
    startQRScanner();
  } else {
    // 既に動いている場合はそのまま
    updateScanStatus('QRコードをカメラに向けてください', 'scanning');
  }
});

  
  // データ管理メニュー
  addClickListener('backToMainFromMenu', () => {
    console.log('🏠 メイン画面へ戻る');
    showScreen('mainScreen');
  });
  
  addClickListener('viewCustomersBtn', () => {
    console.log('👥 顧客一覧表示');
    displayCustomerList();
    showScreen('customerListScreen');
  });
  
  addClickListener('viewEntriesBtn', () => {
    console.log('📋 入場記録一覧表示');
    displayEntryList();
    showScreen('entryListScreen');
  });
  
  addClickListener('exportDataBtn', () => {
    console.log('💾 CSV エクスポート');
    exportToCSV();
  });
  
  addClickListener('clearDataBtn', () => {
    if (confirm('⚠️ 入場記録を全て削除しますか?\nこの操作は取り消せません。')) {
      entryData = [];
      processedCustomers.clear();
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      updateStats();
      alert('✅ 入場記録をクリアしました');
    }
  });
  
  // 顧客一覧画面
  addClickListener('backToMenuFromCustomers', () => {
    console.log('📋 メニューへ戻る');
    showScreen('dataMenuScreen');
  });
  
  // 入場記録一覧画面
  addClickListener('backToMenuFromEntries', () => {
    console.log('📋 メニューへ戻る');
    showScreen('dataMenuScreen');
  });
  
  listenersSetup = true;
  console.log('✅ イベントリスナー設定完了');
}

function addClickListener(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    // 既存のリスナーを削除してから追加（重複防止）
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);
    newElement.addEventListener('click', handler);
  } else {
    console.warn(`⚠️ 要素が見つかりません: ${id}`);
  }
}

// Service Worker登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('✅ Service Worker登録成功'))
      .catch(error => console.log('❌ Service Worker登録失敗:', error));
  });
}

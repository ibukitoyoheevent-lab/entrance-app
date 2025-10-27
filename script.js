// 入場管理アプリのメイン設定
const CONFIG = {
  GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx5M1F8vLTzURCoMUN1Op3SGmxAvtpaJCkJmg9a5qgRbIFkgPaAvRJP6oH3AC2KrUlr/exec',
  STORAGE_KEY: 'entryManagementData',
  CUSTOMER_STORAGE_KEY: 'customerData',
  CAMERA_PREFERENCE: 'environment', // 'user' for front camera, 'environment' for rear camera
  PREFER_ONLINE_DATA: true,
  FALLBACK_SAMPLE_DATA: false
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
let currentCustomer = null; // 現在処理中の顧客情報
let currentCameraIndex = 0;
let availableCamerasList = [];

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ 入場管理アプリが読み込まれました (外カメラ・オンライン優先版)');
  
  // 初期データ読み込み
  loadStoredData();
  updateStats();
  
  // イベントリスナー設定
  setupEventListeners();
  
  // 初回データ読み込み（オンライン優先）
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
    
    const response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL + '?action=getCustomers', {
      method: 'GET',
      cache: 'no-cache'
    });
    
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
      alert('❌ オンラインデータの取得に失敗しました\n' +
            'インターネット接続とGoogle Apps Scriptの設定を確認してください\n\n' +
            'エラー: ' + error.message);
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
        })
      });
      
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

// startQRScanner関数の修正版（PC Chrome対応）
async function startQRScanner() {
  console.log('🎥 QRスキャナー開始 - カメラ優先: environment (外カメラ)');
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qrReader");
  }
  
  // カメラ起動準備表示
  const qrReaderElement = document.getElementById('qrReader');
  if (qrReaderElement) {
    qrReaderElement.classList.remove('camera-ready');
  }
  
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    disableFlip: false, // カメラ反転を許可
    videoConstraints: {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
  
  try {
    console.log('🎥 カメラ起動開始...');
    updateScanStatus('カメラ起動中...', 'scanning');
    
    // 方法1: facingMode exact指定（iPhone最優先）
    try {
      await html5QrCode.start(
        { facingMode: { exact: "environment" } },
        config,
        onScanSuccess,
        onScanFailure
      );
      
      console.log('✅ 外カメラで起動成功（exact指定）');
      if (qrReaderElement) qrReaderElement.classList.add('camera-ready');
      isScanning = true;
      cameraInitialized = true;
      updateScanStatus('QRコードをカメラに向けてください', 'scanning');
      showFlipCameraButton();
      return;
      
    } catch (exactError) {
      console.log('⚠️ exact指定失敗:', exactError.message);
    }
    
    // 方法2: facingMode ideal指定
    try {
      await html5QrCode.start(
        { facingMode: { ideal: "environment" } },
        config,
        onScanSuccess,
        onScanFailure
      );
      
      console.log('✅ カメラ起動成功（ideal指定）');
      if (qrReaderElement) qrReaderElement.classList.add('camera-ready');
      isScanning = true;
      cameraInitialized = true;
      updateScanStatus('QRコードをカメラに向けてください', 'scanning');
      showFlipCameraButton();
      return;
      
    } catch (idealError) {
      console.log('⚠️ ideal指定失敗:', idealError.message);
    }
    
    // 方法3: facingMode文字列指定（PC Chrome用）
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
      );
      
      console.log('✅ カメラ起動成功（文字列指定）');
      if (qrReaderElement) qrReaderElement.classList.add('camera-ready');
      isScanning = true;
      cameraInitialized = true;
      updateScanStatus('QRコードをカメラに向けてください', 'scanning');
      showFlipCameraButton();
      return;
      
    } catch (stringError) {
      console.log('⚠️ 文字列指定失敗:', stringError.message);
    }
    
    // 方法4: カメラリストから選択
    console.log('📷 カメラリストを取得中...');
    const cameras = await Html5Qrcode.getCameras();
    console.log('📷 利用可能なカメラ:', cameras.length, '台');
    
    if (cameras.length === 0) {
      throw new Error('利用可能なカメラが見つかりませんでした');
    }
    
    // カメラリストを保存
    availableCamerasList = cameras;
    
    cameras.forEach((cam, i) => {
      console.log(`  ${i+1}. ID: ${cam.id}, ラベル: ${cam.label}`);
    });
    
    // 外カメラを探す
    let selectedCamera = null;
    let selectedIndex = -1;
    
    // ラベルで外カメラを検索
    const rearCameraIndex = cameras.findIndex(cam => {
      const label = cam.label.toLowerCase();
      return label.includes('back') || 
             label.includes('rear') || 
             label.includes('environment') ||
             label.includes('背面') ||
             label.includes('リア') ||
             label.includes('背面カメラ');
    });
    
    if (rearCameraIndex !== -1) {
      selectedCamera = cameras[rearCameraIndex];
      selectedIndex = rearCameraIndex;
      console.log('✅ 外カメラを検出:', selectedCamera.label);
    } else {
      // 外カメラが見つからない場合は最後のカメラを使用
      selectedCamera = cameras[cameras.length - 1];
      selectedIndex = cameras.length - 1;
      console.log('⚠️ 外カメラ未検出。最後のカメラを使用:', selectedCamera.label);
    }
    
    currentCameraIndex = selectedIndex;
    
    // カメラIDで起動
    await html5QrCode.start(
      selectedCamera.id,
      config,
      onScanSuccess,
      onScanFailure
    );
    
    console.log('✅ カメラ起動成功');
    console.log('📷 使用中:', selectedCamera.label);
    
    if (qrReaderElement) qrReaderElement.classList.add('camera-ready');
    isScanning = true;
    cameraInitialized = true;
    updateScanStatus('QRコードをカメラに向けてください', 'scanning');
    showFlipCameraButton();
    
  } catch (error) {
    console.error('❌ カメラ起動失敗:', error);
    if (qrReaderElement) qrReaderElement.classList.remove('camera-ready');
    updateScanStatus('カメラの起動に失敗しました', 'error');
    
    // エラー種類別の詳細メッセージ
    let errorMessage = 'カメラの起動に失敗しました。\n\n';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMessage += '【原因】カメラへのアクセスが拒否されています\n\n';
      errorMessage += '【対処法】\n';
      
      // デバイス判定
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);
      
      if (isIOS) {
        errorMessage += '【iPhone/iPad】\n';
        errorMessage += '1. Safariのアドレスバー左の「AA」をタップ\n';
        errorMessage += '2. 「Webサイトの設定」をタップ\n';
        errorMessage += '3. 「カメラ」を「許可」に変更\n';
        errorMessage += '4. ページを再読み込み\n\n';
        errorMessage += 'または\n';
        errorMessage += '設定 → Safari → カメラ → 許可';
      } else if (isAndroid) {
        errorMessage += '【Android】\n';
        errorMessage += '1. アドレスバーの左にある🔒アイコンをタップ\n';
        errorMessage += '2. 「権限」をタップ\n';
        errorMessage += '3. 「カメラ」を「許可」に変更\n';
        errorMessage += '4. ページを再読み込み';
      } else {
        errorMessage += '【PC】\n';
        errorMessage += '1. アドレスバーのカメラアイコンをクリック\n';
        errorMessage += '2. 「このサイトでカメラを常に許可」を選択\n';
        errorMessage += '3. ページを再読み込み';
      }
      
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMessage += '【原因】カメラが見つかりませんでした\n\n';
      errorMessage += '【対処法】\n';
      errorMessage += '• 他のアプリがカメラを使用していないか確認\n';
      errorMessage += '• カメラが物理的に接続されているか確認\n';
      errorMessage += '• デバイスを再起動\n';
      errorMessage += '• 別のブラウザで試す（Chrome, Safari, Firefox等）';
      
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMessage += '【原因】カメラが他のアプリで使用中です\n\n';
      errorMessage += '【対処法】\n';
      errorMessage += '• Zoom、Skype、カメラアプリなどを終了\n';
      errorMessage += '• 他のブラウザタブでカメラを使用していないか確認\n';
      errorMessage += '• デバイスを再起動';
      
    } else if (error.name === 'OverconstrainedError') {
      errorMessage += '【原因】指定されたカメラ設定がサポートされていません\n\n';
      errorMessage += '【対処法】\n';
      errorMessage += '• 外カメラがない場合は内カメラを使用\n';
      errorMessage += '• 「🔄 カメラ切り替え」ボタンで別のカメラを試す';
      
    } else if (error.name === 'SecurityError') {
      errorMessage += '【原因】セキュリティエラー\n\n';
      errorMessage += '【対処法】\n';
      errorMessage += '• HTTPSで接続されているか確認\n';
      errorMessage += '• ブラウザのセキュリティ設定を確認\n';
      errorMessage += '• プライベートブラウズモードを無効化';
      
    } else {
      errorMessage += '【対処法】\n';
      errorMessage += '• ページを再読み込み\n';
      errorMessage += '• ブラウザを再起動\n';
      errorMessage += '• デバイスを再起動\n';
      errorMessage += '• 別のブラウザで試す\n\n';
      errorMessage += `エラー詳細: ${error.name || 'Unknown'}\n${error.message}`;
    }
    
    alert(errorMessage);
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
  
  // 入場履歴表示
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
// イベントリスナー設定
// ==========================================

function setupEventListeners() {
  // メイン画面
  addClickListener('startQRScan', () => {
    showScreen('qrScanScreen');
    startQRScanner();
  });
  
  addClickListener('manualEntry', () => {
    showScreen('manualEntryScreen');
  });
  
  addClickListener('updateBtn', async () => {
    const success = await fetchCustomerData();
    if (success) {
      alert('✅ オンラインデータを更新しました');
    }
  });
  
  addClickListener('menuBtn', () => {
    showScreen('dataMenuScreen');
  });
  
  // QRスキャン画面
  addClickListener('stopQRScan', () => {
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
    stopQRScanner();
    showScreen('manualEntryScreen');
  });
  
  // カメラ切り替えボタン
  addClickListener('flipCameraBtn', flipCamera);
  
  // 手動入力画面
  addClickListener('backToMain', () => {
    showScreen('mainScreen');
  });
  
  addClickListener('searchButton', () => {
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
      alert('❌ 該当する顧客が見つかりませんでした\n\n' +
            '• チケット番号、名前、メールアドレスで検索できます\n' +
            '• 最新データを取得するには「データ更新」ボタンを押してください');
    }
  });
  
  // 顧客情報画面
  addClickListener('backToSearch', () => {
    showScreen('manualEntryScreen');
  });
  
  addClickListener('confirmEntry', async () => {
    const entryCount = parseInt(document.getElementById('entryCountInput').value);
    
    if (!currentCustomer) {
      alert('❌ 顧客情報が取得できませんでした');
      return;
    }
    
    try {
      showLoading();
      await saveEntry(currentCustomer, entryCount);
      
      // 完了画面に遷移
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
    if (continuousScanMode && cameraInitialized) {
      showScreen('qrScanScreen');
      resumeQRScanner();
    } else {
      showScreen('mainScreen');
    }
  });
  
  // データ管理メニュー
  addClickListener('backToMainFromMenu', () => {
    showScreen('mainScreen');
  });
  
  addClickListener('viewCustomersBtn', () => {
    displayCustomerList();
    showScreen('customerListScreen');
  });
  
  addClickListener('viewEntriesBtn', () => {
    displayEntryList();
    showScreen('entryListScreen');
  });
  
  addClickListener('exportDataBtn', exportToCSV);
  
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
    showScreen('dataMenuScreen');
  });
  
  // 入場記録一覧画面
  addClickListener('backToMenuFromEntries', () => {
    showScreen('dataMenuScreen');
  });
  
  // ボタンにクリック時の視覚的フィードバックを追加
  const allButtons = document.querySelectorAll('button');
  allButtons.forEach((button) => {
    button.addEventListener('click', function() {
      button.style.transform = 'scale(0.95)';
      setTimeout(() => {
        button.style.transform = '';
      }, 150);
    });
  });
}

function addClickListener(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('click', handler);
  } else {
    console.warn(`⚠️ 要素が見つかりません: ${id}`);
  }
}

// Service Worker登録（PWA対応）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('✅ Service Worker登録成功'))
      .catch(error => console.log('❌ Service Worker登録失敗:', error));
  });
}

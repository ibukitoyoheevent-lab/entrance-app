// 入場管理アプリのメイン設定
const CONFIG = {
  GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzhMroDqsp9_fNtxRoj9Qcl39iY2YXGQdc5HxT0AFbEppDLz2kguHQGgmxB6nig-S-W/exec',
  STORAGE_KEY: 'entryManagementData',
  CUSTOMER_STORAGE_KEY: 'customerData',
  // カメラ設定: 外カメラを優先
  CAMERA_PREFERENCE: 'environment', // 'user' for front camera, 'environment' for rear camera
  // データ取得設定: オンライン優先
  PREFER_ONLINE_DATA: true,
  // オフライン用サンプルデータ（オンライン取得失敗時のみ使用）
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

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
  console.log('入場管理アプリが読み込まれました (外カメラ・オンライン優先版)');
  
  // 画面要素の取得
  const mainScreen = document.getElementById('mainScreen');
  const qrScanScreen = document.getElementById('qrScanScreen');
  const manualEntryScreen = document.getElementById('manualEntryScreen');
  const customerInfoScreen = document.getElementById('customerInfoScreen');
  const completionScreen = document.getElementById('completionScreen');
  const dataMenuScreen = document.getElementById('dataMenuScreen');
  const customerListScreen = document.getElementById('customerListScreen');
  const entryListScreen = document.getElementById('entryListScreen');
  const loading = document.getElementById('loading');
  
  // 初期データ読み込み
  loadStoredData();
  updateStats();
  
  // 画面切り替え関数
  function showScreen(screenId) {
    console.log('画面切り替え:', screenId);
    
    // 全ての画面を非表示
    const screens = [mainScreen, qrScanScreen, manualEntryScreen, customerInfoScreen, 
                    completionScreen, dataMenuScreen, customerListScreen, entryListScreen];
    screens.forEach(screen => {
      if (screen) screen.classList.add('hidden');
    });
    
    // 指定された画面を表示
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.classList.remove('hidden');
    }
  }
  
  // ローディング表示/非表示
  function showLoading() {
    loading.classList.remove('hidden');
  }
  
  function hideLoading() {
    loading.classList.add('hidden');
  }
  
  // Google Sheets からデータを取得（オンライン優先）
  async function fetchCustomerData() {
    if (!CONFIG.PREFER_ONLINE_DATA) {
      console.log('オフラインモード設定のため、スキップ');
      return false;
    }
    
    try {
      showLoading();
      console.log('Google Sheetsからオンラインデータを取得中...');
      
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
      console.error('オンラインデータ取得エラー:', error);
      
      if (CONFIG.FALLBACK_SAMPLE_DATA) {
        // サンプルデータを使用（設定で有効な場合のみ）
        customerData = [
          {
            ticketNumber: '634',
            name: 'テスト 太郎',
            email: 'test1@example.com',
            ticketCount: 2,
            seatNumber: 'A-12'
          },
          {
            ticketNumber: '183',
            name: 'サンプル 花子',
            email: 'test2@example.com',
            ticketCount: 1,
            seatNumber: 'B-05'
          },
          {
            ticketNumber: '631',
            name: 'デモ 次郎',
            email: 'test3@example.com',
            ticketCount: 3,
            seatNumber: 'C-08'
          }
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
  
  // ローカルストレージからデータ読み込み
  function loadStoredData() {
    const storedCustomers = localStorage.getItem(CONFIG.CUSTOMER_STORAGE_KEY);
    const storedEntries = localStorage.getItem(CONFIG.STORAGE_KEY);
    
    if (storedCustomers) {
      customerData = JSON.parse(storedCustomers);
      console.log(`📁 保存済み顧客データ: ${customerData.length}件`);
    }
    
    if (storedEntries) {
      entryData = JSON.parse(storedEntries);
      // Set processed customers
      entryData.forEach(entry => {
        processedCustomers.add(entry.ticketNumber);
      });
      console.log(`📁 保存済み入場記録: ${entryData.length}件`);
    }
  }
  
  // 統計情報更新
  function updateStats() {
    const entryCountElement = document.getElementById('entryCount');
    const totalTicketsElement = document.getElementById('totalTickets');
    
    const totalEntries = entryData.reduce((sum, entry) => sum + (entry.entryCount || 1), 0);
    const totalTickets = customerData.reduce((sum, customer) => sum + (customer.ticketCount || 1), 0);
    
    if (entryCountElement) entryCountElement.textContent = totalEntries;
    if (totalTicketsElement) totalTicketsElement.textContent = totalTickets;
  }
  
  // QRコード読み取り開始（外カメラ優先）
  function startQRScanner() {
    console.log('QRスキャナー開始 (外カメラ優先)');
    
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("qrReader");
    }
    
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      // 外カメラを優先する設定
      facingMode: CONFIG.CAMERA_PREFERENCE
    };
    
    Html5Qrcode.getCameras().then(cameras => {
      if (cameras && cameras.length) {
        console.log(`利用可能なカメラ: ${cameras.length}台`);
        
        // 外カメラを優先して選択
        let selectedCamera = cameras[0]; // デフォルト
        
        // 外カメラを探す
        const rearCamera = cameras.find(camera => 
          camera.label && (
            camera.label.toLowerCase().includes('back') ||
            camera.label.toLowerCase().includes('rear') ||
            camera.label.toLowerCase().includes('environment')
          )
        );
        
        if (rearCamera && CONFIG.CAMERA_PREFERENCE === 'environment') {
          selectedCamera = rearCamera;
          console.log('🎥 外カメラを選択:', selectedCamera.label);
        } else {
          console.log('🎥 カメラを選択:', selectedCamera.label);
        }
        
        html5QrCode.start(selectedCamera.id, config, onScanSuccess, onScanFailure)
          .then(() => {
            console.log('✅ QRスキャナー開始成功');
            isScanning = true;
            cameraInitialized = true;
            updateScanStatus('QRコードをカメラに向けてください', 'scanning');
          })
          .catch(err => {
            console.error('❌ QRスキャナー開始エラー:', err);
            updateScanStatus('カメラの起動に失敗しました', 'error');
            
            // 詳細なエラーメッセージ
            let errorMessage = 'カメラへのアクセス許可が必要です。\n';
            if (err.name === 'NotAllowedError') {
              errorMessage += '• ブラウザでカメラ許可を「許可」に設定してください\n';
              errorMessage += '• プライベートモードの場合は通常モードをお試しください';
            } else if (err.name === 'NotFoundError') {
              errorMessage += '• カメラが見つかりません\n• デバイスにカメラが接続されているか確認してください';
            } else {
              errorMessage += '• ブラウザの設定を確認してください\n• ページを再読み込みしてお試しください';
            }
            
            alert(errorMessage);
          });
      } else {
        alert('❌ 利用可能なカメラが見つかりませんでした');
      }
    }).catch(err => {
      console.error('❌ カメラ取得エラー:', err);
      alert('❌ カメラへのアクセスに失敗しました\nデバイスとブラウザの設定を確認してください');
    });
  }
  
  // QRスキャン成功時の処理
  function onScanSuccess(decodedText, decodedResult) {
    console.log('✅ QRコード読み取り成功:', decodedText);
    
    if (isPaused) return;
    
    updateScanStatus('QRコードを読み取りました', 'success');
    
    // 顧客検索
    const customer = findCustomer(decodedText);
    if (customer) {
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
  
  // QRスキャン失敗時の処理
  function onScanFailure(error) {
    // エラーメッセージは表示しない（通常の動作）
  }
  
  // スキャンステータス更新
  function updateScanStatus(message, type = '') {
    const statusElement = document.getElementById('qrScanStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = 'scan-status ' + type;
    }
  }
  
  // QRスキャナー一時停止（カメラストリーム保持）
  function pauseQRScanner() {
    if (html5QrCode && isScanning && !isPaused) {
      html5QrCode.pause();
      isPaused = true;
      updateScanStatus('スキャンを一時停止しました', 'paused');
      console.log('⏸️ QRスキャナー一時停止（カメラストリーム保持）');
    }
  }
  
  // QRスキャナー再開
  function resumeQRScanner() {
    if (html5QrCode && isScanning && isPaused) {
      html5QrCode.resume();
      isPaused = false;
      updateScanStatus('QRコードをカメラに向けてください', 'scanning');
      console.log('▶️ QRスキャナー再開');
    }
  }
  
  // QRスキャナー停止
  function stopQRScanner() {
    if (html5QrCode && isScanning) {
      html5QrCode.stop().then(() => {
        console.log('⏹️ QRスキャナー停止');
        isScanning = false;
        isPaused = false;
        cameraInitialized = false;
      }).catch(err => {
        console.error('QRスキャナー停止エラー:', err);
      });
    }
  }
  
  // 顧客検索
  function findCustomer(query) {
    return customerData.find(customer => 
      customer.ticketNumber === query || 
      customer.name.includes(query) || 
      customer.email.includes(query)
    );
  }
  
  // 顧客情報表示
  function displayCustomerInfo(customer) {
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
  
  // 入場記録保存（オンライン優先）
  async function saveEntry(customer, entryCount) {
    const entry = {
      ticketNumber: customer.ticketNumber,
      customerName: customer.name,
      entryCount: parseInt(entryCount),
      entryTime: new Date().toISOString(),
      timestamp: Date.now()
    };
    
    // ローカル保存（即座に実行）
    entryData.push(entry);
    processedCustomers.add(customer.ticketNumber);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(entryData));
    updateStats();
    
    // Google Sheetsに送信（オンライン優先）
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
        // エラーが発生してもローカル保存は完了しているので処理続行
      }
    }
    
    return entry;
  }
  
  // イベントリスナー設定
  setupEventListeners();
  
  function setupEventListeners() {
    // メイン画面のボタン
    const startQRScanBtn = document.getElementById('startQRScan');
    if (startQRScanBtn) {
      startQRScanBtn.addEventListener('click', function() {
        console.log('📷 QRスキャン開始');
        showScreen('qrScanScreen');
        startQRScanner();
      });
    }
    
    const manualEntryBtn = document.getElementById('manualEntry');
    if (manualEntryBtn) {
      manualEntryBtn.addEventListener('click', function() {
        showScreen('manualEntryScreen');
      });
    }
    
    const updateBtn = document.getElementById('updateBtn');
    if (updateBtn) {
      updateBtn.addEventListener('click', async function() {
        const success = await fetchCustomerData();
        if (success) {
          alert('✅ オンラインデータを更新しました');
        } else {
          alert('❌ データ更新に失敗しました');
        }
      });
    }
    
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function() {
        showScreen('dataMenuScreen');
      });
    }
    
    // QRスキャン画面のボタン
    const stopQRScanBtn = document.getElementById('stopQRScan');
    if (stopQRScanBtn) {
      stopQRScanBtn.addEventListener('click', function() {
        stopQRScanner();
        showScreen('mainScreen');
      });
    }
    
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    if (pauseResumeBtn) {
      pauseResumeBtn.addEventListener('click', function() {
        if (isPaused) {
          resumeQRScanner();
          pauseResumeBtn.innerHTML = '⏸️ 一時停止';
        } else {
          pauseQRScanner();
          pauseResumeBtn.innerHTML = '▶️ 再開';
        }
      });
    }
    
    const continuousModeBtn = document.getElementById('continuousModeBtn');
    if (continuousModeBtn) {
      continuousModeBtn.addEventListener('click', function() {
        continuousScanMode = !continuousScanMode;
        if (continuousScanMode) {
          continuousModeBtn.innerHTML = '🔄 連続スキャン: ON';
        } else {
          continuousModeBtn.innerHTML = '🔄 連続スキャン: OFF';
        }
      });
    }
    
    const switchToManualBtn = document.getElementById('switchToManual');
    if (switchToManualBtn) {
      switchToManualBtn.addEventListener('click', function() {
        stopQRScanner();
        showScreen('manualEntryScreen');
      });
    }
    
    // 手動入力画面のボタン
    const backToMainBtn = document.getElementById('backToMain');
    if (backToMainBtn) {
      backToMainBtn.addEventListener('click', function() {
        showScreen('mainScreen');
      });
    }
    
    const searchButton = document.getElementById('searchButton');
    if (searchButton) {
      searchButton.addEventListener('click', function() {
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
    }
    
    // 顧客情報画面のボタン
    const backToSearchBtn = document.getElementById('backToSearch');
    if (backToSearchBtn) {
      backToSearchBtn.addEventListener('click', function() {
        showScreen('manualEntryScreen');
      });
    }
    
    const confirmEntryBtn = document.getElementById('confirmEntry');
    if (confirmEntryBtn) {
      confirmEntryBtn.addEventListener('click', async function() {
        const entryCount = parseInt(document.getElementById('entryCountInput').value);
        const customerTicket = document.getElementById('customerTicket').textContent;
        const customerName = document.getElementById('customerName').textContent;
        
        if (!customerTicket || customerTicket === '-') {
          alert('❌ 顧客情報が取得できませんでした');
          return;
        }
        
        const customer = {
          ticketNumber: customerTicket,
          name: customerName
        };
        
        try {
          showLoading();
          const entry = await saveEntry(customer, entryCount);
          
          // 完了画面に遷移
          document.getElementById('completedCustomerName').textContent = customerName;
          document.getElementById('completedTicketNumber').textContent = customerTicket;
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
    }
    
    // 完了画面のボタン
    const nextCustomerBtn = document.getElementById('nextCustomer');
    if (nextCustomerBtn) {
      nextCustomerBtn.addEventListener('click', function() {
        if (continuousScanMode && cameraInitialized) {
          showScreen('qrScanScreen');
          resumeQRScanner();
        } else {
          showScreen('mainScreen');
        }
      });
    }
    
    // データ管理メニューのボタン
    const backToMainFromMenuBtn = document.getElementById('backToMainFromMenu');
    if (backToMainFromMenuBtn) {
      backToMainFromMenuBtn.addEventListener('click', function() {
        showScreen('mainScreen');
      });
    }
    
    const viewCustomersBtn = document.getElementById('viewCustomersBtn');
    if (viewCustomersBtn) {
      viewCustomersBtn.addEventListener('click', function() {
        displayCustomerList();
        showScreen('customerListScreen');
      });
    }
    
    const viewEntriesBtn = document.getElementById('viewEntriesBtn');
    if (viewEntriesBtn) {
      viewEntriesBtn.addEventListener('click', function() {
        displayEntryList();
        showScreen('entryListScreen');
      });
    }
    
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', function() {
        exportToCSV();
      });
    }
    
    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', function() {
        if (confirm('⚠️ 入場記録を全て削除しますか？\nこの操作は取り消せません。')) {
          entryData = [];
          processedCustomers.clear();
          localStorage.removeItem(CONFIG.STORAGE_KEY);
          updateStats();
          alert('✅ 入場記録をクリアしました');
        }
      });
    }
    
    // 顧客一覧画面のボタン
    const backToMenuFromCustomersBtn = document.getElementById('backToMenuFromCustomers');
    if (backToMenuFromCustomersBtn) {
      backToMenuFromCustomersBtn.addEventListener('click', function() {
        showScreen('dataMenuScreen');
      });
    }
    
    // 入場記録一覧画面のボタン
    const backToMenuFromEntriesBtn = document.getElementById('backToMenuFromEntries');
    if (backToMenuFromEntriesBtn) {
      backToMenuFromEntriesBtn.addEventListener('click', function() {
        showScreen('dataMenuScreen');
      });
    }
    
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
  
  // 顧客一覧表示
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
  
  // 入場記録一覧表示
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
    
    const sortedEntries = [...entryData].reverse(); // 最新順
    
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
  
  // CSV エクスポート
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
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
  
  // 初期化完了
  console.log('✅ 入場管理アプリの初期化が完了しました');
  
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

// 背面カメラでQRスキャン開始
async function startBackCameraScan() {
  const readerElId = "qrReader"; // index.htmlに存在
  const html5QrCode = new Html5Qrcode(readerElId);

  // 1) facingMode指定で試す
  try {
    await html5QrCode.start(
      { facingMode: { exact: "environment" } },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      onScanSuccess,
      onScanFailure
    );
    window.__qr = html5QrCode;
    return;
  } catch (_) {}

  // 2) デバイス列挙 → "back"/"rear"/"environment" を含むIDを選択
  const cameras = await Html5Qrcode.getCameras();
  if (!cameras || !cameras.length) throw new Error("カメラが見つかりません");
  const back = cameras.find(c =>
    /back|rear|environment/i.test(`${c.label} ${c.id}`)
  ) || cameras[0]; // フォールバック

  await html5QrCode.start(
    back.id,
    { fps: 10, qrbox: { width: 240, height: 240 } },
    onScanSuccess,
    onScanFailure
  );
  window.__qr = html5QrCode;
}

// 既存の開始ボタンと接続（index.htmlに#startQRScanあり）
document.getElementById("startQRScan")?.addEventListener("click", async () => {
  document.getElementById("qrScanScreen")?.classList.remove("hidden");
  document.getElementById("mainScreen")?.classList.add("hidden");
  setScanStatus("scanning", "カメラを起動しています…");
  try {
    await startBackCameraScan();
    setScanStatus("scanning", "QRコードをカメラに向けてください");
  } catch (e) {
    setScanStatus("error", `カメラ起動に失敗：${e.message}`);
  }
});

// 既存UIに合わせた状態表示（index.htmlに#qrScanStatusあり）
function setScanStatus(kind, text) {
  const el = document.getElementById("qrScanStatus");
  if (!el) return;
  el.className = `scan-status ${kind}`;
  el.textContent = text || "";
}

// トーチ切替（端末対応時のみ）
async function toggleTorch(on = true) {
  try {
    await window.__qr?.applyVideoConstraints({ advanced: [{ torch: on }] });
  } catch (_) { /* 非対応端末は無視 */ }
}


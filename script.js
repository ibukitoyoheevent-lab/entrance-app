<!DOCTYPE html>
<html lang="ja" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>カメラ許可問題解決版 script.js</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css" />
    <style>
      body {
        max-width: 880px;
        margin: 0 auto;
        padding: 32px 80px;
        position: relative;
        box-sizing: border-box;
        font-family: 'Times New Roman', serif;
        line-height: 1.6;
        color: #333;
        background: white;
      }

      h1 {
        text-align: center;
        color: #2c3e50;
        border-bottom: 2px solid #2c3e50;
        padding-bottom: 16px;
        margin-bottom: 32px;
      }

      h2 {
        color: #34495e;
        margin-top: 32px;
        margin-bottom: 16px;
      }

      .code-section {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 20px;
        margin: 20px 0;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        line-height: 1.4;
      }

      .description {
        background: #e7f3ff;
        border-left: 4px solid #2196f3;
        padding: 15px;
        margin: 15px 0;
      }

      .warning {
        background: #fff3cd;
        border-left: 4px solid #ffc107;
        padding: 15px;
        margin: 15px 0;
      }
    </style>
  </head>
  <body>
    <h1>カメラ許可問題解決版 script.js</h1>

    <div class="description">
      <strong>概要：</strong
      >この修正版script.jsファイルは、QRコード読み取り後にカメラ許可が消える問題を解決し、既存の全機能を維持しながら、カメラストリーム保持、一時停止・再開、連続スキャンモードを実装します。
    </div>

    <h2>完全修正版 script.js</h2>

    <div class="code-section">
      <pre>
new_string:
// ========================================
// 入場管理アプリ - カメラ許可問題解決版 JavaScript
// QRスキャン後もカメラストリームを維持する改良版
// ========================================

// === API設定 ===
const API_CONFIG = {
    // Google Apps Script Web App URL（あなたのURLに変更してください）
    BASE_URL: 'https://script.google.com/macros/s/AKfycbzhMroDqsp9_fNtxRoj9Qcl39iY2YXGQdc5HxT0AFbEppDLz2kguHQGgmxB6nig-S-W/exec',
    
    TIMEOUT: 10000,
    MAX_RETRIES: 3
};

// === グローバル変数 ===
let customers = [];
let processedCustomers = [];
let currentCustomer = null;
let html5QrCode = null;
let isScanning = false;

// === NEW: カメラ許可問題解決用の変数 ===
let scannerPaused = false; // スキャナー一時停止フラグ
let continuousScanMode = true; // 連続スキャンモード
let cameraInitialized = false; // カメラ初期化完了フラグ
let autoReturnToScan = true; // 自動でスキャン画面に戻る機能

// === アプリケーション初期化 ===
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 入場管理アプリを開始します（カメラ許可問題解決版）');
    
    // 設定の読み込み
    loadScanSettings();
    
    setupEventListeners();
    loadProcessedCustomers();
    loadCustomersFromAPI();
    updateStats();
    
    console.log('✅ 初期化完了（カメラ保持機能付き）');
});

// === NEW: スキャン設定の読み込み ===
function loadScanSettings() {
    try {
        const savedContinuousMode = localStorage.getItem('continuousScanMode');
        if (savedContinuousMode !== null) {
            continuousScanMode = JSON.parse(savedContinuousMode);
        }
        
        const savedAutoReturn = localStorage.getItem('autoReturnToScan');
        if (savedAutoReturn !== null) {
            autoReturnToScan = JSON.parse(savedAutoReturn);
        }
        
        console.log('⚙️ スキャン設定読み込み:', { continuousScanMode, autoReturnToScan });
    } catch (error) {
        console.error('❌ スキャン設定読み込みエラー:', error);
    }
}

// === イベントリスナー設定（統合版） ===
function setupEventListeners() {
    console.log('🔗 イベントリスナー設定開始...');
    
    // メイン画面
    safeAddEventListener('startQRScan', 'click', showQRScanScreen);
    safeAddEventListener('manualEntry', 'click', showManualEntryScreen);
    safeAddEventListener('updateBtn', 'click', loadCustomersFromAPI);
    
    // データ管理メニュー
    safeAddEventListener('menuBtn', 'click', showDataMenuScreen);
    safeAddEventListener('backToMainFromMenu', 'click', showMainScreen);
    
    // QRスキャン画面
    safeAddEventListener('stopQRScan', 'click', function() {
        stopQRScanner();
        showMainScreen();
    });
    safeAddEventListener('switchToManual', 'click', function() {
        stopQRScanner();
        showManualEntryScreen();
    });
    
    // NEW: QRスキャン画面の新機能
    safeAddEventListener('pauseResumeBtn', 'click', function() {
        if (scannerPaused) {
            resumeQRScanner();
        } else {
            pauseQRScanner();
        }
        updatePauseResumeButton();
    });
    
    safeAddEventListener('continuousModeBtn', 'click', function() {
        toggleContinuousMode();
        updateContinuousModeButton();
    });
    
    // 手動入力画面
    safeAddEventListener('searchButton', 'click', performSearch);
    safeAddEventListener('backToMain', 'click', showMainScreen);
    safeAddEventListener('searchInput', 'keypress', function(e) {
        if (e.key === 'Enter') performSearch();
    });
    
    // 顧客情報画面
    safeAddEventListener('confirmEntry', 'click', processEntry);
    safeAddEventListener('backToSearch', 'click', showMainScreen);
    
    // 完了画面
    safeAddEventListener('nextCustomer', 'click', showMainScreen);
    
    // データ管理機能
    safeAddEventListener('viewCustomersBtn', 'click', showCustomerListScreen);
    safeAddEventListener('backToMenuFromCustomers', 'click', showDataMenuScreen);
    safeAddEventListener('customerSearchInput', 'input', filterCustomerList);
    safeAddEventListener('customerFilterSelect', 'change', filterCustomerList);
    
    safeAddEventListener('viewEntriesBtn', 'click', showEntryListScreen);
    safeAddEventListener('backToMenuFromEntries', 'click', showDataMenuScreen);
    safeAddEventListener('entrySearchInput', 'input', filterEntryList);
    safeAddEventListener('entryDateFilter', 'change', filterEntryList);
    
    safeAddEventListener('exportDataBtn', 'click', exportData);
    safeAddEventListener('clearDataBtn', 'click', clearEntryData);
    
    console.log('✅ すべてのイベントリスナー設定完了');
}

function safeAddEventListener(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
        console.log(`${elementId} にイベントリスナー設定完了`);
    } else {
        console.warn(`要素が見つかりません: ${elementId}`);
    }
}

// === 改良版: QRスキャナー開始（カメラストリーム保持） ===
async function startQRScanner() {
    console.log('📷 QRスキャナー開始（カメラストリーム保持版）');
    
    try {
        // 既に初期化済みで一時停止中の場合は再開
        if (html5QrCode && cameraInitialized && scannerPaused) {
            resumeQRScanner();
            return;
        }
        
        // 新規初期化または再初期化
        if (!html5QrCode || !cameraInitialized) {
            html5QrCode = new Html5Qrcode("qrReader");
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                disableFlip: false,
                rememberLastUsedCamera: true // カメラ選択を記憶
            };
            
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                onQRScanSuccess,
                onQRScanError
            );
            
            cameraInitialized = true;
        }
        
        isScanning = true;
        scannerPaused = false;
        
        updateScanStatus('QRコードをカメラに向けてください', 'scanning');
        console.log('✅ QRスキャナー開始成功');
        
    } catch (error) {
        console.error('❌ QRスキャナー開始エラー:', error);
        updateScanStatus('カメラの起動に失敗しました', 'error');
        cameraInitialized = false;
        isScanning = false;
        
        // カメラエラー時は手動入力を推奨
        setTimeout(() => {
            showMessage('カメラが使用できません。手動入力をご利用ください。');
            showManualEntryScreen();
        }, 2000);
    }
}

// === NEW: QRスキャナー一時停止（カメラ保持） ===
function pauseQRScanner() {
    if (!html5QrCode || !isScanning || scannerPaused) {
        return;
    }
    
    console.log('⏸️ QRスキャナー一時停止（カメラストリーム保持）');
    scannerPaused = true;
    
    updateScanStatus('スキャンを一時停止しました', 'paused');
    showMessage('スキャンを一時停止しました', 'warning');
}

// === NEW: QRスキャナー再開 ===
function resumeQRScanner() {
    if (!html5QrCode || !cameraInitialized || !scannerPaused) {
        return;
    }
    
    console.log('▶️ QRスキャナー再開');
    scannerPaused = false;
    isScanning = true;
    
    updateScanStatus('QRコードをカメラに向けてください', 'scanning');
    showMessage('スキャンを再開しました', 'success');
}

// === 改良版: QRスキャナー停止（clear()を使わない） ===
async function stopQRScanner() {
    if (!html5QrCode || !isScanning) {
        return;
    }
    
    try {
        console.log('⏹️ QRスキャナー停止（カメラストリーム保持）');
        
        // カメラストリームは停止するが、clear()は呼ばない
        await html5QrCode.stop();
        
        isScanning = false;
        scannerPaused = false;
        // cameraInitializedはtrueのまま保持
        
        console.log('✅ QRスキャナー停止完了（再起動高速化）');
        
    } catch (error) {
        console.error('❌ QRスキャナー停止エラー:', error);
        isScanning = false;
        scannerPaused = false;
    }
}

// === NEW: 完全なリソース解放（アプリ終了時のみ） ===
function completelyStopScanner() {
    console.log('🛑 スキャナー完全停止');
    
    if (html5QrCode && cameraInitialized) {
        html5QrCode.stop()
            .then(() => {
                // 完全終了時のみclear()を実行
                html5QrCode.clear();
                html5QrCode = null;
                cameraInitialized = false;
                isScanning = false;
                scannerPaused = false;
                console.log('✅ スキャナー完全停止完了');
            })
            .catch(error => {
                console.error('❌ 完全停止エラー:', error);
            });
    }
}

// === 改良版: QRコード読み取り成功時の処理 ===
function onQRScanSuccess(decodedText) {
    // 一時停止中は処理しない
    if (scannerPaused) {
        return;
    }
    
    console.log('✅ QRコード読み取り成功:', decodedText);
    playSuccessSound();
    updateScanStatus('読み取り成功！', 'success');
    
    // 顧客情報を検索
    const customer = findCustomerByQR(decodedText);
    
    if (customer) {
        console.log('👤 顧客発見:', customer.name);
        
        // 連続スキャンモードでない場合のみ一時停止
        if (!continuousScanMode) {
            pauseQRScanner();
        }
        
        showCustomerInfo(customer);
        
    } else {
        console.log('❌ 顧客が見つかりません');
        playErrorSound();
        updateScanStatus('顧客が見つかりません', 'error');
        showMessage('該当するチケットが見つかりません', 'error');
        
        // 連続スキャンモードの場合、継続してスキャン
        setTimeout(() => {
            updateScanStatus('QRコードをカメラに向けてください', 'scanning');
        }, 3000);
    }
}

function onQRScanError(errorMessage) {
    // エラーは頻繁なので無視
}

// === NEW: 連続スキャンモード切り替え ===
function toggleContinuousMode() {
    continuousScanMode = !continuousScanMode;
    
    // ローカルストレージに保存
    localStorage.setItem('continuousScanMode', JSON.stringify(continuousScanMode));
    
    const message = `連続スキャンモードを${continuousScanMode ? 'ON' : 'OFF'}にしました`;
    showMessage(message, 'info');
    
    console.log('🔄 連続スキャンモード:', continuousScanMode);
}

// === NEW: ボタン状態更新 ===
function updatePauseResumeButton() {
    const button = document.getElementById('pauseResumeBtn');
    if (button) {
        button.textContent = scannerPaused ? '▶️ 再開' : '⏸️ 一時停止';
    }
}

function updateContinuousModeButton() {
    const button = document.getElementById('continuousModeBtn');
    if (button) {
        button.textContent = `🔄 連続スキャン: ${continuousScanMode ? 'ON' : 'OFF'}`;
    }
}

// === API通信（修正版） ===
async function loadCustomersFromAPI() {
    showLoading(true);
    
    try {
        // URLパラメータとして送信（CORS回避）
        const url = `${API_CONFIG.BASE_URL}?action=getCustomers&origin=${encodeURIComponent(window.location.origin)}&_t=${Date.now()}`;
        
        console.log('API URL:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        console.log('Response text:', text);
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new Error('無効なJSONレスポンス');
        }
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (!data.customers || !Array.isArray(data.customers)) {
            throw new Error('顧客データが無効な形式です');
        }
        
        customers = data.customers;
        saveCustomersToLocal();
        showMessage(`${customers.length}件の顧客データを更新しました`);
        updateStats();
        
        console.log('API取得成功:', customers.length, '件');
        
    } catch (error) {
        console.error('API取得エラー:', error);
        loadCustomersFromLocal();
        showMessage('データ更新に失敗しました。オフラインデータを使用します。');
    } finally {
        showLoading(false);
    }
}

async function recordEntryToAPI(customer, entryCount) {
    try {
        const url = `${API_CONFIG.BASE_URL}?action=recordEntry&origin=${encodeURIComponent(window.location.origin)}&ticketNumber=${encodeURIComponent(customer.ticketNumber)}&name=${encodeURIComponent(customer.name)}&entryCount=${entryCount}&deviceId=${encodeURIComponent(getDeviceId())}&_t=${Date.now()}`;
        
        console.log('Entry API URL:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        const data = JSON.parse(text);
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        console.log('入場記録API送信成功');
        return data;
        
    } catch (error) {
        console.error('入場記録API送信エラー:', error);
        // エラーでもローカルには記録済みなので、処理は継続
    }
}

// === ローカルストレージ ===
function saveCustomersToLocal() {
    try {
        localStorage.setItem('customers', JSON.stringify(customers));
    } catch (error) {
        console.error('データ保存エラー:', error);
    }
}

function loadCustomersFromLocal() {
    try {
        const saved = localStorage.getItem('customers');
        if (saved) {
            customers = JSON.parse(saved);
            console.log(`${customers.length}件のローカルデータを読み込み`);
        } else {
            customers = getSampleData();
            console.log('サンプルデータを使用');
        }
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        customers = getSampleData();
    }
}

function getSampleData() {
    return [
        {
            ticketNumber: '634',
            name: '小倉 文',
            email: 'ogura@example.com',
            tickets: 2,
            seatNumber: 'A1-A2',
            qrCode: 'TICKET634'
        },
        {
            ticketNumber: '183',
            name: '渡瀬 美有',
            email: 'watase@example.com',
            tickets: 2,
            seatNumber: 'B3-B4',
            qrCode: 'TICKET183'
        },
        {
            ticketNumber: '631',
            name: '親一郎 川本',
            email: 'kawamoto@example.com',
            tickets: 7,
            seatNumber: 'C1-C7',
            qrCode: 'TICKET631'
        }
    ];
}

function saveProcessedCustomers() {
    try {
        localStorage.setItem('processedCustomers', JSON.stringify(processedCustomers));
    } catch (error) {
        console.error('データ保存エラー:', error);
    }
}

function loadProcessedCustomers() {
    try {
        const saved = localStorage.getItem('processedCustomers');
        if (saved) {
            processedCustomers = JSON.parse(saved);
            console.log(`${processedCustomers.length}件の入場済みデータを読み込み`);
        }
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        processedCustomers = [];
    }
}

// === 画面制御 ===
function showMainScreen() {
    console.log('メイン画面表示');
    hideAllScreens();
    const mainScreen = document.getElementById('mainScreen');
    if (mainScreen) {
        mainScreen.classList.remove('hidden');
    }
    updateStats();
}

function showQRScanScreen() {
    console.log('QRスキャン画面表示');
    hideAllScreens();
    const qrScreen = document.getElementById('qrScanScreen');
    if (qrScreen) {
        qrScreen.classList.remove('hidden');
    }
    
    // ボタンの状態を更新
    updatePauseResumeButton();
    updateContinuousModeButton();
    
    // スキャナーを開始（カメラ初期化済みの場合は再開）
    setTimeout(() => {
        if (html5QrCode && cameraInitialized) {
            resumeQRScanner();
        } else {
            startQRScanner();
        }
    }, 500);
}

function showManualEntryScreen() {
    console.log('手動入力画面表示');
    hideAllScreens();
    const manualScreen = document.getElementById('manualEntryScreen');
    if (manualScreen) {
        manualScreen.classList.remove('hidden');
    }
    
    const searchInput = document.getElementById('searchInput');
    const searchResult = document.getElementById('searchResult');
    
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    
    if (searchResult) {
        searchResult.innerHTML = '';
    }
}

function showDataMenuScreen() {
    console.log('データ管理メニュー画面表示');
    hideAllScreens();
    const menuScreen = document.getElementById('dataMenuScreen');
    if (menuScreen) {
        menuScreen.classList.remove('hidden');
    }
}

function showCustomerListScreen() {
    console.log('顧客データ一覧画面表示');
    hideAllScreens();
    const customerListScreen = document.getElementById('customerListScreen');
    if (customerListScreen) {
        customerListScreen.classList.remove('hidden');
    }
    displayCustomerList();
}

function showEntryListScreen() {
    console.log('入場記録一覧画面表示');
    hideAllScreens();
    const entryListScreen = document.getElementById('entryListScreen');
    if (entryListScreen) {
        entryListScreen.classList.remove('hidden');
    }
    displayEntryList();
}

function hideAllScreens() {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.add('hidden');
    });
}

// === 検索・顧客情報表示 ===
function findCustomerByQR(qrText) {
    return customers.find(c => 
        c.qrCode === qrText || 
        c.ticketNumber.toString() === qrText ||
        qrText.includes(c.ticketNumber.toString())
    );
}

function updateScanStatus(message, status) {
    const statusElement = document.getElementById('qrScanStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `scan-status ${status}`;
    }
}

function performSearch() {
    console.log('検索実行');
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    
    if (!query) {
        showMessage('検索キーワードを入力してください');
        return;
    }
    
    const results = customers.filter(customer => 
        customer.name.includes(query) ||
        customer.email.includes(query) ||
        customer.ticketNumber.toString().includes(query)
    );
    
    displaySearchResults(results);
}

function displaySearchResults(results) {
    const resultDiv = document.getElementById('searchResult');
    if (!resultDiv) return;
    
    if (results.length === 0) {
        resultDiv.innerHTML = '<p class="no-results">該当する顧客が見つかりませんでした</p>';
        return;
    }
    
    resultDiv.innerHTML = results.map((customer, index) => `
        <div class="customer-result" onclick="selectCustomer('${customer.ticketNumber}')">
            <div class="customer-name">${customer.name}</div>
            <div class="customer-details">
                チケット番号: ${customer.ticketNumber} | 
                購入枚数: ${customer.tickets}枚
                ${customer.seatNumber ? ` | 座席: ${customer.seatNumber}` : ''}
            </div>
        </div>
    `).join('');
}

function selectCustomer(ticketNumber) {
    const customer = customers.find(c => c.ticketNumber.toString() === ticketNumber);
    if (customer) {
        showCustomerInfo(customer);
    }
}

function showCustomerInfo(customer) {
    console.log('顧客情報表示:', customer.name);
    hideAllScreens();
    
    const customerScreen = document.getElementById('customerInfoScreen');
    if (!customerScreen) return;
    
    customerScreen.classList.remove('hidden');
    currentCustomer = customer;
    
    // 情報表示
    safeSetTextContent('customerName', customer.name);
    safeSetTextContent('customerTicket', customer.ticketNumber);
    safeSetTextContent('customerEmail', customer.email);
    safeSetTextContent('customerTickets', `${customer.tickets}枚`);
    safeSetTextContent('customerSeat', customer.seatNumber || '指定なし');
    
    // 入場人数の初期値設定
    const entryCountInput = document.getElementById('entryCountInput');
    if (entryCountInput) {
        entryCountInput.value = customer.tickets || 1;
        entryCountInput.max = customer.tickets || 10;
    }
    
    // 入場履歴を表示
    displayCustomerEntryHistory(customer);
}

function safeSetTextContent(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

// === 入場処理 ===
function processEntry() {
    if (!currentCustomer) {
        showMessage('顧客が選択されていません');
        return;
    }
    
    const entryCountInput = document.getElementById('entryCountInput');
    const entryCount = entryCountInput ? parseInt(entryCountInput.value) : 1;
    
    if (entryCount < 1 || entryCount > (currentCustomer.tickets || 10)) {
        showMessage('入場人数が正しくありません');
        return;
    }
    
    console.log('入場処理:', currentCustomer.name);
    
    const processedCustomer = {
        ...currentCustomer,
        entryTime: new Date().toLocaleString('ja-JP'),
        entryCount: entryCount
    };
    
    processedCustomers.push(processedCustomer);
    saveProcessedCustomers();
    
    // APIに送信（失敗してもローカルには記録済み）
    recordEntryToAPI(currentCustomer, entryCount);
    
    playSuccessSound();
    showCompletionScreen(processedCustomer);
}

// === 改良版: 入場完了後の処理 ===
function showCompletionScreen(customer) {
    console.log('🎉 入場完了画面表示');
    
    hideAllScreens();
    
    const completionScreen = document.getElementById('completionScreen');
    if (!completionScreen) return;
    
    completionScreen.classList.remove('hidden');
    
    safeSetTextContent('completedCustomerName', customer.name);
    safeSetTextContent('completedTicketNumber', customer.ticketNumber);
    safeSetTextContent('completedTickets', `${customer.entryCount}名`);
    safeSetTextContent('entryTime', customer.entryTime);
    
    updateStats();
    
    // 連続スキャンモードと自動復帰設定に応じて処理
    const autoReturnTime = continuousScanMode ? 1500 : 3000;
    
    setTimeout(() => {
        if (continuousScanMode && autoReturnToScan && html5QrCode && cameraInitialized) {
            // 連続モードの場合、スキャン画面に戻る
            showQRScanScreen();
        } else {
            showMainScreen();
        }
    }, autoReturnTime);
}

// === 統計更新 ===
function updateStats() {
    const totalProcessed = processedCustomers.length;
    const totalTickets = processedCustomers.reduce((sum, customer) => sum + (customer.entryCount || customer.tickets || 1), 0);
    
    const statsElement = document.getElementById('stats');
    if (statsElement) {
        statsElement.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">${totalProcessed}</div>
                <div class="stat-label">入場者数</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${totalTickets}</div>
                <div class="stat-label">総チケット数</div>
            </div>
        `;
    }
}

// === データ管理機能（簡略版） ===
function displayCustomerList() {
    const listElement = document.getElementById('customerList');
    const statsElement = document.getElementById('customerListStats');
    
    if (!listElement || !statsElement) return;
    
    // 統計更新
    const totalCustomers = customers.length;
    const enteredCustomers = customers.filter(customer => 
        processedCustomers.some(p => p.ticketNumber === customer.ticketNumber)
    ).length;
    
    statsElement.textContent = `全${totalCustomers}名 (入場済み: ${enteredCustomers}名, 未入場: ${totalCustomers - enteredCustomers}名)`;
    
    // リスト表示
    if (customers.length === 0) {
        listElement.innerHTML = '<p class="no-data">顧客データがありません</p>';
        return;
    }
    
    const customersToShow = getFilteredCustomers();
    
    listElement.innerHTML = customersToShow.map(customer => {
        const hasEntered = processedCustomers.some(p => p.ticketNumber === customer.ticketNumber);
        const entryCount = processedCustomers.filter(p => p.ticketNumber === customer.ticketNumber).length;
        
        return `
            <div class="list-item ${hasEntered ? 'entered' : 'not-entered'}" onclick="showCustomerDetailFromList('${customer.ticketNumber}')">
                <div class="list-item-header">
                    <span class="customer-name">${customer.name}</span>
                    <span class="entry-status ${hasEntered ? 'entered' : 'pending'}">
                        ${hasEntered ? `✅ 入場済み (${entryCount}回)` : '⏳ 未入場'}
                    </span>
                </div>
                <div class="list-item-details">
                    <span>チケット: ${customer.ticketNumber}</span>
                    <span>枚数: ${customer.tickets}枚</span>
                    <span>座席: ${customer.seatNumber || '未指定'}</span>
                </div>
                <div class="list-item-email">${customer.email}</div>
            </div>
        `;
    }).join('');
}

function displayEntryList() {
    const listElement = document.getElementById('entryList');
    const statsElement = document.getElementById('entryListStats');
    
    if (!listElement || !statsElement) return;
    
    // 統計更新
    const totalEntries = processedCustomers.length;
    const totalTickets = processedCustomers.reduce((sum, customer) => 
        sum + (customer.entryCount || customer.tickets || 1), 0);
    
    statsElement.textContent = `全${totalEntries}件の入場記録 (総チケット数: ${totalTickets}枚)`;
    
    // リスト表示
    if (processedCustomers.length === 0) {
        listElement.innerHTML = '<p class="no-data">入場記録がありません</p>';
        return;
    }
    
    const entriesToShow = getFilteredEntries();
    
    listElement.innerHTML = entriesToShow.map((entry, index) => `
        <div class="list-item entry-item">
            <div class="list-item-header">
                <span class="customer-name">${entry.name}</span>
                <span class="entry-time">${entry.entryTime}</span>
            </div>
            <div class="list-item-details">
                <span>チケット: ${entry.ticketNumber}</span>
                <span>入場人数: ${entry.entryCount || entry.tickets || 1}名</span>
                <span>座席: ${entry.seatNumber || '未指定'}</span>
            </div>
            <div class="list-item-email">${entry.email}</div>
        </div>
    `).join('');
}

function getFilteredCustomers() {
    const searchTerm = document.getElementById('customerSearchInput')?.value.toLowerCase() || '';
    const filter = document.getElementById('customerFilterSelect')?.value || 'all';
    
    let filtered = customers.filter(customer => {
        const matchesSearch = 
            customer.name.toLowerCase().includes(searchTerm) ||
            customer.email.toLowerCase().includes(searchTerm) ||
            customer.ticketNumber.toString().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        const hasEntered = processedCustomers.some(p => p.ticketNumber === customer.ticketNumber);
        
        switch (filter) {
            case 'entered': return hasEntered;
            case 'not-entered': return !hasEntered;
            default: return true;
        }
    });
    
    return filtered;
}

function getFilteredEntries() {
    const searchTerm = document.getElementById('entrySearchInput')?.value.toLowerCase() || '';
    const dateFilter = document.getElementById('entryDateFilter')?.value || '';
    
    let filtered = processedCustomers.filter(entry => {
        const matchesSearch = 
            entry.name.toLowerCase().includes(searchTerm) ||
            entry.ticketNumber.toString().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        if (dateFilter) {
            const entryDate = new Date(entry.entryTime).toISOString().split('T')[0];
            if (entryDate !== dateFilter) return false;
        }
        
        return true;
    });
    
    // 新しい順にソート
    return filtered.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
}

function filterCustomerList() {
    displayCustomerList();
}

function filterEntryList() {
    displayEntryList();
}

function showCustomerDetailFromList(ticketNumber) {
    const customer = customers.find(c => c.ticketNumber.toString() === ticketNumber);
    if (customer) {
        showCustomerInfo(customer);
    }
}

function displayCustomerEntryHistory(customer) {
    const historySection = document.getElementById('entryHistory');
    const historyList = document.getElementById('entryHistoryList');
    
    if (!historySection || !historyList) return;
    
    const customerEntries = processedCustomers.filter(p => p.ticketNumber === customer.ticketNumber);
    
    if (customerEntries.length > 0) {
        historySection.classList.remove('hidden');
        historyList.innerHTML = customerEntries.map((entry, index) => `
            <div class="history-item">
                <div class="history-time">${entry.entryTime}</div>
                <div class="history-details">入場人数: ${entry.entryCount || entry.tickets || 1}名</div>
            </div>
        `).join('');
    } else {
        historySection.classList.add('hidden');
    }
}

function exportData() {
    const csvData = generateCSVData();
    downloadCSV(csvData, `入場記録_${new Date().toISOString().split('T')[0]}.csv`);
    showMessage('データをCSVファイルでダウンロードしました');
}

function generateCSVData() {
    const headers = ['入場時刻', 'チケット番号', '名前', 'メールアドレス', '入場人数', '座席番号'];
    const rows = processedCustomers.map(entry => [
        entry.entryTime,
        entry.ticketNumber,
        entry.name,
        entry.email,
        entry.entryCount || entry.tickets || 1,
        entry.seatNumber || ''
    ]);
    
    return [headers, ...rows].map(row => 
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function clearEntryData() {
    if (confirm('本当に入場記録をすべてクリアしますか？この操作は元に戻せません。')) {
        processedCustomers = [];
        saveProcessedCustomers();
        updateStats();
        showMessage('入場記録をクリアしました');
        showDataMenuScreen();
    }
}

// === ユーティリティ ===
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }
}

function showMessage(message, type = 'info') {
    console.log('メッセージ:', message);
    
    const existingMessages = document.querySelectorAll('.app-message');
    existingMessages.forEach(msg => msg.remove());
    
    const colors = {
        success: '#4CAF50',
        error: '#f44336', 
        warning: '#FF9800',
        info: '#2196F3'
    };
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'app-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors[type] || colors.info};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        z-index: 9999;
        font-size: 16px;
        font-weight: bold;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 4000);
}

function playSuccessSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.log('音声再生不可');
    }
}

function playErrorSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.log('音声再生不可');
    }
}

function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// === ページ離脱時のクリーンアップ ===
window.addEventListener('beforeunload', function() {
    console.log('👋 アプリ終了 - カメラリソース解放');
    completelyStopScanner();
});

// === Service Worker登録 ===
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(registration => {
            console.log('Service Worker登録成功');
        })
        .catch(error => {
            console.log('Service Worker登録スキップ:', error.message);
        });
}

console.log('🚀 カメラ許可問題解決版 script.js 読み込み完了');

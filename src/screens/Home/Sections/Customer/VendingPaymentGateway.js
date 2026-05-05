import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@stores/auth';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  ActivityIndicator,
  Dimensions,
  Linking,
  Alert,
} from 'react-native';

const { width } = Dimensions.get('window');

// UPI App configurations
const UPI_APPS = [
  {
    id: 'gpay',
    name: 'Google Pay',
    icon: require('../../../../../assets/icons/modal/google-pay-logo-transparent-free-png.png'),
    packageName: 'com.google.android.apps.nbu.paisa.user',
    urlScheme: 'gpay://',
    color: '#4285F4',
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    icon: require('../../../../../assets/icons/modal/phonepe.png'),
    packageName: 'com.phonepe.app',
    urlScheme: 'phonepe://',
    color: '#5F259F',
  },
  {
    id: 'bhim',
    name: 'BHIM',
    icon: require('../../../../../assets/icons/modal/bhim.png'),
    packageName: 'in.org.npci.upiapp',
    urlScheme: 'bhim://',
    color: '#00BFA5',
  },
  {
    id: 'paytm',
    name: 'PAYTM',
    icon: require('../../../../../assets/icons/modal/paytm.png'),
    packageName: 'net.one97.paytm',
    urlScheme: 'paytm://',
    color: '#00BAF2',
  },
  {
    id: 'amazonpay',
    name: 'Amazon Pay',
    icon: require('../../../../../assets/icons/modal/ampay.png'),
    packageName: 'in.amazon.mShop.android.shopping',
    urlScheme: 'amazonpay://',
    color: '#FF9900',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: require('../../../../../assets/icons/modal/wppay.png'),
    packageName: 'com.whatsapp',
    urlScheme: 'whatsapp://',
    color: '#25D366',
  },
];

// Custom Icon Components (SVG-like using View)
const StoreIcon = () => (
  <View style={styles.storeIconContainer}>
    <View style={styles.storeIconRoof} />
    <View style={styles.storeIconBody}>
      <View style={styles.storeIconDoor} />
    </View>
  </View>
);

const BackIcon = () => (
  <View style={styles.backIconContainer}>
    <View style={styles.backIconArrow} />
  </View>
);

const CloseIcon = () => (
  <Text style={styles.closeIconText}>×</Text>
);

const CheckIcon = () => (
  <View style={styles.checkIconContainer}>
    <Text style={styles.checkIconText}>✓</Text>
  </View>
);

const FailIcon = () => (
  <View style={styles.failIconContainer}>
    <Text style={styles.failIconText}>✕</Text>
  </View>
);

// QR Code Component (Simple representation)
const QRCodeDisplay = ({ value, size = 150 }) => {
  // In production, use a library like 'react-native-qrcode-svg'
  // This is a visual placeholder that shows the concept
  const generateQRPattern = () => {
    const cells = [];
    const cellCount = 21;
    const cellSize = size / cellCount;
    
    // Generate pseudo-random pattern based on value
    const seed = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    for (let row = 0; row < cellCount; row++) {
      for (let col = 0; col < cellCount; col++) {
        // Position detection patterns (corners)
        const isTopLeftCorner = row < 7 && col < 7;
        const isTopRightCorner = row < 7 && col >= cellCount - 7;
        const isBottomLeftCorner = row >= cellCount - 7 && col < 7;
        
        let isFilled = false;
        
        if (isTopLeftCorner || isTopRightCorner || isBottomLeftCorner) {
          // Draw finder patterns
          const localRow = row >= cellCount - 7 ? row - (cellCount - 7) : row;
          const localCol = col >= cellCount - 7 ? col - (cellCount - 7) : col;
          
          if (localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6) {
            isFilled = true;
          } else if (localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4) {
            isFilled = true;
          }
        } else {
          // Random data pattern
          isFilled = ((seed * (row + 1) * (col + 1)) % 3) === 0;
        }
        
        if (isFilled) {
          cells.push(
            <View
              key={`${row}-${col}`}
              style={{
                position: 'absolute',
                left: col * cellSize,
                top: row * cellSize,
                width: cellSize,
                height: cellSize,
                backgroundColor: '#000',
              }}
            />
          );
        }
      }
    }
    return cells;
  };

  return (
    <View style={[styles.qrCodeContainer, { width: size, height: size }]}>
      <View style={[styles.qrCodeInner, { width: size, height: size }]}>
        {generateQRPattern()}
      </View>
    </View>
  );
};

// Main Payment Screen Component
const PaymentScreen = (props) => {
  const { route = {}, navigation } = props;
  const params = route.params || {};

  // Resolve initial values from either direct props (for unit tests) or navigation params
  const initialAmount = props.amount ?? params.amount ?? 1799;
  const initialInvoice = props.invoiceNumber ?? params.invoiceNumber ?? null;
  const initialInvoiceId = props.invoiceId ?? params.invoiceId ?? null;
  const merchantName = props.merchantName ?? 'Merchant Store';
  const merchantUpiId = props.merchantUpiId ?? 'merchant@upi';
  const onPaymentSuccess = props.onPaymentSuccess;
  const onPaymentFailure = props.onPaymentFailure;
  const onBack = props.onBack ?? (() => navigation?.goBack?.());
  const testModeApiEndpoint = props.testModeApiEndpoint ?? 'https://api.example.com/test-payment';
  const qrGenerateApiEndpoint = props.qrGenerateApiEndpoint ?? 'https://api.example.com/generate-qr';

  // State Management
  const [amount, setAmount] = useState(initialAmount);
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoice || `INV11_${Date.now()}`);
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || null);
  // Auth token from store (set during login)
  const authUser = useAuthStore((s) => s.user);
  const apiToken = null; // API keys removed; rely on session-based authentication
  const [qrData, setQrData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [transactionId, setTransactionId] = useState(null);
  const [showGetButton, setShowGetButton] = useState(false);
  const [isGetLoading, setIsGetLoading] = useState(false);
  const [productImages, setProductImages] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);

  // Generate Invoice Number on mount
  useEffect(() => {
    if (!initialInvoice) {
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      setInvoiceNumber(`INV11_${timestamp}`);
    }
  }, []);

  // Generate QR Code
  const generateQRCode = useCallback(async () => {
    setIsLoading(true);
    try {
      // API call to generate dynamic QR code
      const response = await fetch(qrGenerateApiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount,
          invoice_number: invoiceNumber,
          merchant_upi_id: merchantUpiId,
          merchant_name: merchantName,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setQrData(data.qr_string || generateUPIString());
      } else {
        // Fallback to local QR generation
        setQrData(generateUPIString());
      }
    } catch (error) {
      console.log('QR API Error, using fallback:', error);
      // Fallback to local QR generation
      setQrData(generateUPIString());
    } finally {
      setIsLoading(false);
    }
  }, [amount, invoiceNumber, merchantUpiId, merchantName]);

  // Generate UPI String locally
  const generateUPIString = () => {
    const upiString = `upi://pay?pa=${merchantUpiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${invoiceNumber}&cu=INR`;
    return upiString;
  };

  // Handle Test Mode
  const handleTestMode = async () => {
    setIsTestMode(true);
    setIsLoading(true);
    
    try {
      // API call for test mode payment
      const response = await fetch(testModeApiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount,
          invoice_number: invoiceNumber,
          test_mode: true,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        // Payment Success
        setTransactionId(data.transaction_id || `TXN${Date.now()}`);
        setPaymentStatus('success');
        setShowSuccessModal(true);
        onPaymentSuccess?.({
          amount,
          invoiceNumber,
          transactionId: data.transaction_id,
          status: 'success',
        });
      } else {
        // Payment Failed
        setPaymentStatus('failed');
        setShowFailureModal(true);
        onPaymentFailure?.({
          amount,
          invoiceNumber,
          error: data.error || 'Payment failed',
          status: 'failed',
        });
      }
    } catch (error) {
      // Network or API error - show failure
      console.log('Test Mode API Error:', error);
      setPaymentStatus('failed');
      setShowFailureModal(true);
      onPaymentFailure?.({
        amount,
        invoiceNumber,
        error: error.message || 'Network error',
        status: 'failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle UPI App Payment
  const handleUPIPayment = async (app) => {
    const upiString = qrData || generateUPIString();

    // Different URL schemes for different apps
    let paymentUrl = upiString;

    if (app.id === 'gpay') {
      paymentUrl = `tez://upi/pay?pa=${merchantUpiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${invoiceNumber}&cu=INR`;
    } else if (app.id === 'phonepe') {
      paymentUrl = `phonepe://pay?pa=${merchantUpiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${invoiceNumber}&cu=INR`;
    } else if (app.id === 'paytm') {
      paymentUrl = `paytmmp://pay?pa=${merchantUpiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${invoiceNumber}&cu=INR`;
    }

    try {
      const canOpen = await Linking.canOpenURL(paymentUrl);
      if (canOpen) {
        await Linking.openURL(paymentUrl);
        return true;
      }

      // Try generic UPI intent only if a handler exists
      const genericUPI = generateUPIString();
      const canOpenGeneric = await Linking.canOpenURL(genericUPI);
      if (canOpenGeneric) {
        await Linking.openURL(genericUPI);
        return true;
      }

      // No UPI app/handler available — log and let caller decide next steps
      console.warn(`${app.name} not available and no UPI handler found.`);
      return false;
    } catch (error) {
      // Log error and let caller decide next steps
      console.warn('UPI launch error', error);
      return false;
    }
  };

  // Start UPI flow with realistic processing indicator, then reveal Get button
  const handleStartUPI = async (app) => {
    try {
      setShowGetButton(false);
      setIsLoading(true);
      // Attempt to launch UPI app (or generic handler). We don't reveal Get here;
      // the Get button should only appear after the processing delay below.
      await handleUPIPayment(app);

      // Simulate realistic processing delay (give user time to switch to UPI app)
      setTimeout(() => {
        setIsLoading(false);
        setShowGetButton(true);
      }, 2500);
    } catch (err) {
      // Ensure we stop loading and reveal Get after the same processing interval
      console.warn('handleStartUPI error', err);
      setTimeout(() => {
        setIsLoading(false);
        setShowGetButton(true);
      }, 2500);
    }
  };

  // Format amount with currency
  const formatAmount = (value) => {
    return `₹${value.toLocaleString('en-IN')}`;
  };

  // Render UPI App Button
  const renderUPIApp = (app) => {
    const largeIds = ['gpay','paytm','phonepe','bhim','amazonpay','whatsapp'];
    const isLarge = largeIds.includes(app.id);
    const isAmazon = app.id === 'amazonpay';
    const isGpay = app.id === 'gpay';
    const imageSource = typeof app.icon === 'number' || (app.icon && typeof app.icon === 'object') ? app.icon : { uri: app.icon };
    const containerStyle = isLarge ? styles.upiAppIconContainerLarge : styles.upiAppIconContainer;
    const containerStyleFinal = isAmazon ? styles.upiAppIconContainerAmazon : (isGpay ? styles.upiAppIconContainerLarge : containerStyle);
    // override: make PhonePe outer round background white
    const containerOverride = app.id === 'phonepe' ? { backgroundColor: '#FFFFFF' } : {};
    const imageOverride = app.id === 'phonepe' ? { backgroundColor: '#FFFFFF' } : {};

    return (
      <TouchableOpacity
        key={app.id}
        style={styles.upiAppButton}
        onPress={() => handleStartUPI(app)}
        activeOpacity={0.7}
      >
        <View style={[containerStyleFinal, containerOverride, { marginBottom: 8 }]}>
          <Image
            source={imageSource}
            style={isGpay ? styles.upiAppIconGpay : (isAmazon ? styles.upiAppIconAmazon : (isLarge ? styles.upiAppIconLarge : styles.upiAppIcon))}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.upiAppName}>{app.name}</Text>
      </TouchableOpacity>
    );
  };

  // Success Modal
  const renderSuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSuccessModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.successIconWrapper}>
            <CheckIcon />
          </View>
          <Text style={styles.modalTitle}>Payment Successful!</Text>
          <Text style={styles.modalAmount}>{formatAmount(amount)}</Text>
          <View style={styles.modalDetails}>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Transaction ID</Text>
              <Text style={styles.modalDetailValue}>{transactionId}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Invoice Number</Text>
              <Text style={styles.modalDetailValue}>{invoiceNumber}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={() => {
              setShowSuccessModal(false);
              onBack?.();
            }}
          >
            <Text style={styles.modalButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Failure Modal
  const renderFailureModal = () => (
    <Modal
      visible={showFailureModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowFailureModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.failIconWrapper}>
            <FailIcon />
          </View>
          <Text style={styles.modalTitle}>Payment Failed</Text>
          <Text style={styles.modalSubtitle}>
            Your payment could not be processed. Please try again.
          </Text>
          <View style={styles.modalDetails}>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Amount</Text>
              <Text style={styles.modalDetailValue}>{formatAmount(amount)}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Invoice Number</Text>
              <Text style={styles.modalDetailValue}>{invoiceNumber}</Text>
            </View>
          </View>
          <View style={styles.modalButtonGroup}>
            <TouchableOpacity
              style={[styles.modalButton, styles.retryButton]}
              onPress={() => {
                setShowFailureModal(false);
                handleTestMode();
              }}
            >
              <Text style={styles.modalButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => {
                setShowFailureModal(false);
                onBack?.();
              }}
            >
              <Text style={[styles.modalButtonText, styles.cancelButtonText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Loading Overlay
  const renderLoadingOverlay = () => (
    <Modal visible={isLoading} transparent animationType="fade">
      <View style={styles.loadingOverlay}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#FF6B00" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Left Panel - Order Summary */}
      <View style={styles.leftPanel}>
        
        
        <View style={styles.amountSection}>
          <Text style={styles.totalPayableLabel}>Total Payable</Text>
          <TouchableOpacity style={styles.amountContainer}>
            <Text style={styles.amountText}>{formatAmount(amount)}</Text>
            <Text style={styles.amountDropdown}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.secureCheckout}>
          <View style={styles.payuLogo}>
            <Text style={styles.payuText}>pay</Text>
            <View style={styles.payuU}>
              <Text style={styles.payuUText}>U</Text>
            </View>
          </View>
          <Text style={styles.secureText}>Secure Checkout</Text>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedIcon}>✓</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.showInvoicesButton}
          onPress={() => {
            if (typeof onShowInvoices === 'function') {
              onShowInvoices();
            } else {
              Alert.alert('Invoices', 'Show invoices');
            }
          }}
        >
          <Text style={styles.showInvoicesButtonText}>Show Invoices</Text>
        </TouchableOpacity>

        {apiToken && (
          <View style={[styles.transactionInfo, { marginTop: 8 }]}>
            <Text style={styles.transactionLabel}>API Token:</Text>
            <View style={styles.tokenBox}>
              <Text style={styles.tokenText}>{apiToken}</Text>
            </View>
          </View>
        )}
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionLabel}>Transaction Id:</Text>
          <View style={styles.invoiceBox}>
            <Text style={styles.invoiceText}>{invoiceNumber}</Text>
          </View>
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionLabel}>Invoice Id:</Text>
          <View style={styles.invoiceBox}>
            <Text style={styles.invoiceText}>{invoiceId || '—'}</Text>
          </View>
        </View>
      </View>

      {/* Right Panel - Payment Options */}
      <View style={styles.rightPanel}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.testModeLabel}>Test Mode</Text>
          
          <TouchableOpacity
            style={styles.testModeButton}
            onPress={handleTestMode}
          >
            <View style={styles.testModeIcon}>
              <Text style={styles.testModeIconText}>⊕</Text>
            </View>
          </TouchableOpacity>
        </View>

        <FlatList
          data={UPI_APPS}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.rightFlatListContent}
          renderItem={({ item }) => renderUPIApp(item)}
          ListHeaderComponent={() => (
            <>
              {/* BHIM UPI Section */}
              <View style={styles.bhimHeader}>
                <Image source={require('../../../../../assets/icons/modal/Bhim-logo.png')} style={styles.bhimLogoImg} resizeMode="contain" />
                <View style={styles.upiLogoContainer}>
                  <Image source={require('../../../../../assets/icons/modal/upi.png')} style={styles.upiLogoImg} resizeMode="contain" />
                </View>
              </View>

              {/* QR Code Section */}
              <View style={styles.qrSection}>
                <Text style={styles.qrTitle}>SCAN QR & PAY</Text>
                <View style={styles.qrContent}>
                  <View style={styles.qrInfo}>
                    <Text style={styles.qrInfoTitle}>Pay instantly by QR code</Text>
                    <Text style={styles.qrInfoSubtitle}>Scan & Pay using your preferred UPI App</Text>
                    <View style={styles.upiPoweredBy}>
                      <Text style={styles.poweredByText}>POWERED BY</Text>
                      <View style={styles.upiSmallLogo}>
                        <Image
                          source={require('../../../../../assets/icons/modal/360_F_560501607_x7crxqBWbmbgK2k8zOL0gICbIbK9hP6y.png')}
                          style={styles.upiSmallLogoImg}
                          resizeMode="contain"
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.qrCodeWrapper}>
                    <Image
                      source={require('../../../../../assets/icons/modal/Qr-Code-Transparent-PNG.png')}
                      style={styles.qrStaticImg}
                      resizeMode="contain"
                    />
                  </View>
                </View>
              </View>

              {/* UPI Apps Header */}
              <View style={styles.upiAppsSection}>
                <View style={styles.upiAppsHeader}>
                  <View style={styles.upiLogoSmall}><Text style={styles.upiLogoText}>UPI</Text></View>
                  <Text style={styles.upiAppsTitle}>PAY USING ANY UPI APP</Text>
                </View>
              </View>
            </>
          )}
          ListFooterComponent={() => (
            <View style={styles.partnersSection}>
              <View style={styles.partnerLogos}>
                <Image source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/200px-Visa_Inc._logo.svg.png' }} style={styles.partnerLogo} resizeMode="contain" />
                <Image source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/200px-Mastercard-logo.svg.png' }} style={styles.partnerLogo} resizeMode="contain" />
                <Image source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/RuPay.svg/200px-RuPay.svg.png' }} style={styles.partnerLogo} resizeMode="contain" />
              </View>
              {showGetButton && (
                <TouchableOpacity
                  style={[styles.getButton, isGetLoading ? styles.getButtonDisabled : null]}
                  onPress={async () => {
                    // delegate to handler to keep JSX concise
                    if (isGetLoading) return;
                    const handle = async () => {
                      setIsGetLoading(true);
                      try {
                        const db = 'testdb2';
                        const token = apiToken;
                        const invoice_id = invoiceId || '';
                        if (!token || !invoice_id) {
                          Alert.alert('Error', 'Missing token or invoice id');
                          return;
                        }
                        const reqPayload = { db, token, invoice_id };
                        console.log('[GET API] Request:', JSON.stringify(reqPayload, null, 2));
                        const response = await fetch('http://103.42.198.95:8969/api/vending/process', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(reqPayload),
                        });
                        const respText = await response.text();
                        let data;
                        try {
                          data = JSON.parse(respText);
                        } catch (e) {
                          data = respText;
                        }
                        console.log('[GET API] Response:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
                        if (Array.isArray(data) && data.length && data[0].product_id) {
                          setProductImages(data);
                          setShowProductModal(true);
                          // auto-close modal and navigate home after short delay
                          setTimeout(() => {
                            setShowProductModal(false);
                            try { navigation.navigate('Home'); } catch (e) { console.warn('Navigation to Home failed', e); }
                          }, 2500);
                        } else {
                          console.log('[GET API] Non-array response:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
                          try { navigation.navigate('Home'); } catch (e) { console.warn('Navigation to Home failed', e); }
                        }
                      } catch (err) {
                        console.error('[GET API] Error:', err.message || err);
                        try { navigation.navigate('Home'); } catch (e) { console.warn('Navigation to Home failed', e); }
                      } finally {
                        setIsGetLoading(false);
                      }
                    };
                    handle();
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.getButtonInner}>
                    <View style={styles.getButtonIcon}>
                      <Text style={styles.getButtonIconText}>⇣</Text>
                    </View>
                    {isGetLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginLeft: 10 }} />
                    ) : (
                      <Text style={styles.getButtonText}>Get</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Modals */}
      {renderSuccessModal()}
      {renderFailureModal()}
      {renderLoadingOverlay()}
      {showProductModal && (
        <Modal
          visible={showProductModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProductModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { width: '80%', paddingVertical: 16 }] }>
              <Text style={styles.modalTitle}>Dispensed</Text>
              <View style={{ maxHeight: 180, marginVertical: 8 }}>
                {productImages && productImages.length > 0 ? (
                  productImages.map((it, idx) => (
                    <View key={idx} style={{ paddingVertical: 6 }}>
                      <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '600' }}>{it.product_name || it.name || `Product ${it.product_id || idx}`}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ textAlign: 'center' }}>No products</Text>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
      {isGetLoading && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color="#FF6B00" />
              <Text style={styles.loadingText}>Dispensing...</Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
  },
  
  // Left Panel Styles
  leftPanel: {
    width: width * 0.35,
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  storeIconWrapper: {
    width: 60,
    height: 60,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  storeIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeIconRoof: {
    width: 28,
    height: 8,
    backgroundColor: '#333',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  storeIconBody: {
    width: 24,
    height: 16,
    backgroundColor: '#333',
    marginTop: 2,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  storeIconDoor: {
    width: 8,
    height: 10,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  amountSection: {
    marginBottom: 40,
    marginTop: 72,
  },
  totalPayableLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  amountText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E7D32',
  },
  amountDropdown: {
    fontSize: 12,
    color: '#2E7D32',
    marginLeft: 8,
  },
  secureCheckout: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  payuLogo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payuText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  payuU: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 1,
  },
  payuUText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  secureText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  verifiedIcon: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },
  transactionInfo: {
    marginTop: 'auto',
  },
  transactionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  invoiceBox: {
    borderWidth: 1,
    borderColor: '#F44336',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  invoiceText: {
    fontSize: 12,
    color: '#F44336',
    fontFamily: 'monospace',
  },
  tokenBox: {
    borderWidth: 1,
    borderColor: '#6B7280',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
  },
  tokenText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'monospace',
  },
  showInvoicesButton: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignSelf: 'flex-start',
  },
  showInvoicesButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },

  // Right Panel Styles
  rightPanel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  testModeLabel: {
    fontSize: 36,
    color: '#D32F2F',
    fontWeight: '900',
    marginLeft: 12,
    alignSelf: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
  },
  backIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIconArrow: {
    width: 10,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#333',
    transform: [{ rotate: '45deg' }],
  },
  testModeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  testModeIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testModeIconText: {
    fontSize: 20,
    color: '#666',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  
  // BHIM UPI Header
  bhimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  bhimText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00695C',
    marginRight: 8,
  },
  bhimLogoImg: {
    width: 64,
    height: 28,
    marginRight: 8,
  },
  upiLogoContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  upiText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },

  // QR Section
  qrSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  qrTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 16,
  },
  qrContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  qrInfo: {
    flex: 1,
    paddingRight: 16,
  },
  qrInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  qrInfoSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  upiPoweredBy: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  poweredByText: {
    fontSize: 8,
    color: '#999',
    letterSpacing: 0.5,
    marginRight: 6,
  },
  upiSmallLogo: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  upiSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#333',
  },
  upiSmallLogoImg: {
    width: 48,
    height: 16,
  },
  upiLogoImg: {
    width: 64,
    height: 24,
  },
  qrCodeWrapper: {
    alignItems: 'center',
  },
  qrCodeContainer: {
    backgroundColor: '#FFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  qrCodeInner: {
    position: 'relative',
    backgroundColor: '#FFF',
  },
  generateQRPlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  qrPlaceholderIcon: {
    opacity: 0.3,
  },
  qrPlaceholderText: {
    fontSize: 48,
    color: '#999',
  },
  generateQRButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  generateQRText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 0.5,
  },
  generateQRArrow: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },

  // UPI Apps Section
  upiAppsSection: {
    marginBottom: 24,
  },
  upiAppsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  upiLogoSmall: {
    backgroundColor: '#00695C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 10,
  },
  upiLogoText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  upiAppsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
  },
  upiAppsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upiAppButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  upiAppIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  upiAppIcon: {
    width: 28,
    height: 28,
  },
  upiAppIconLarge: {
    width: 88,
    height: 88,
  },
  upiAppIconContainerLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  upiAppIconContainerAmazon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  upiAppIconAmazon: {
    width: 64,
    height: 64,
  },
  upiAppIconContainerGpay: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  upiAppIconGpay: {
    width: 96,
    height: 96,
  },
  
  upiAppName: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  rightFlatListContent: {
    paddingHorizontal: 20,
  },
  qrStaticImg: {
    width: 140,
    height: 140,
  },

  // Partners Section
  partnersSection: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  partnerLogos: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  getButton: {
    marginTop: 18,
    alignSelf: 'flex-end',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  getButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  getButtonIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  getButtonIconText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  getButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  getButtonDisabled: {
    opacity: 0.7,
  },
  partnerLogo: {
    width: 40,
    height: 24,
    marginLeft: 12,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 32,
    width: width * 0.85,
    maxWidth: 400,
    alignItems: 'center',
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIconText: {
    fontSize: 28,
    color: '#FFF',
    fontWeight: '700',
  },
  failIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  failIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failIconText: {
    fontSize: 28,
    color: '#FFF',
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 24,
  },
  modalDetails: {
    width: '100%',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalDetailLabel: {
    fontSize: 13,
    color: '#666',
  },
  modalDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  modalButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  modalButtonGroup: {
    width: '100%',
    gap: 12,
  },
  retryButton: {
    backgroundColor: '#FF6B00',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    color: '#666',
  },

  // Loading Overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: '#FFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },

  // Close Icon
  closeIconText: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
});

export default PaymentScreen;


// ============================================
// USAGE EXAMPLE
// ============================================
/*

import PaymentScreen from './PaymentScreen';

const App = () => {
  const handlePaymentSuccess = (data) => {
    console.log('Payment Success:', data);
    // Navigate to success screen or update order status
  };

  const handlePaymentFailure = (data) => {
    console.log('Payment Failed:', data);
    // Show error message or retry option
  };

  const handleBack = () => {
    // Navigate back to previous screen
    navigation.goBack();
  };

  return (
    <PaymentScreen
      amount={1799}
      invoiceNumber="INV11_20251218155902"
      merchantName="Your Store Name"
      merchantUpiId="yourstore@upi"
      testModeApiEndpoint="https://your-api.com/test-payment"
      qrGenerateApiEndpoint="https://your-api.com/generate-qr"
      onPaymentSuccess={handlePaymentSuccess}
      onPaymentFailure={handlePaymentFailure}
      onBack={handleBack}
    />
  );
};

*/


// ============================================
// API PAYLOAD SPECIFICATIONS
// ============================================
/*

1. QR GENERATE API
   Endpoint: POST /generate-qr
   Request Body:
   {
     "amount": 1799,
     "invoice_number": "INV11_20251218155902",
     "merchant_upi_id": "merchant@upi",
     "merchant_name": "Merchant Store"
   }
   
   Response (Success):
   {
     "success": true,
     "qr_string": "upi://pay?pa=merchant@upi&pn=Merchant%20Store&am=1799&tn=INV11_20251218155902&cu=INR",
     "qr_image_url": "https://api.example.com/qr/abc123.png" // Optional
   }


2. TEST MODE PAYMENT API
   Endpoint: POST /test-payment
   Request Body:
   {
     "amount": 1799,
     "invoice_number": "INV11_20251218155902",
     "test_mode": true
   }
   
   Response (Success):
   {
     "success": true,
     "transaction_id": "TXN123456789",
     "status": "completed",
     "message": "Payment successful"
   }
   
   Response (Failure):
   {
     "success": false,
     "error": "Payment declined",
     "error_code": "INSUFFICIENT_FUNDS",
     "status": "failed"
   }

*/

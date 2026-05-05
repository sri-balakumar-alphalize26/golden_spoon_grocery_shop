import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import Toast from 'react-native-toast-message';
import { createInvoiceFromQuotationOdoo } from '@api/services/generalApi';

const DirectInvoiceScreen = ({ route, navigation }) => {
  const quotationId = route?.params?.quotation_id;

  return (
    <SafeAreaView>
      <NavigationHeader title="Direct Invoice" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <View style={{ margin: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>
            Quotation ID: {quotationId || 'N/A'}
          </Text>
          <Button
            title="Direct Invoice"
            backgroundColor="#FF9800"
            disabled={!quotationId}
            onPress={async () => {
              if (!quotationId) {
                Toast.show({ type: 'error', text1: 'Error', text2: 'No quotation ID found', position: 'bottom' });
                return;
              }
              try {
                const result = await createInvoiceFromQuotationOdoo(quotationId);
                if (result && result.result) {
                  Toast.show({ type: 'success', text1: 'Invoice Created', text2: `Invoice ID: ${result.result}` });
                  // Optionally navigate to invoice details screen here
                } else {
                  console.error('Direct Invoice API error:', result);
                  Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create invoice' });
                }
              } catch (err) {
                console.error('Direct Invoice API exception:', err);
                Toast.show({ type: 'error', text1: 'Error', text2: err?.message || 'Failed to create invoice' });
              }
            }}
          />
        </View>
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default DirectInvoiceScreen;

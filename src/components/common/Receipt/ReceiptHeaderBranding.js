import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ReceiptHeaderBranding = ({ companyProfile, tint = '#fff' }) => {
  if (!companyProfile) return null;
  const { name, street, street2, city, state, zip, country, phone, email } = companyProfile;
  const cityLine = [city, state, zip].filter(Boolean).join(', ').replace(/, (\d)/, ' $1');
  return (
    <View style={styles.wrap}>
      {name ? <Text style={[styles.name, { color: tint }]} numberOfLines={2}>{name}</Text> : null}
      {street ? <Text style={[styles.line, { color: tint }]} numberOfLines={1}>{street}</Text> : null}
      {street2 ? <Text style={[styles.line, { color: tint }]} numberOfLines={1}>{street2}</Text> : null}
      {cityLine ? <Text style={[styles.line, { color: tint }]} numberOfLines={1}>{cityLine}</Text> : null}
      {country ? <Text style={[styles.line, { color: tint }]} numberOfLines={1}>{country}</Text> : null}
      {phone ? <Text style={[styles.line, { color: tint }]} numberOfLines={1}>{phone}</Text> : null}
      {email ? <Text style={[styles.line, { color: tint }]} numberOfLines={1}>{email}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 40 },
  name: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  line: { fontSize: 12, opacity: 0.9, textAlign: 'center', marginTop: 2 },
});

export default ReceiptHeaderBranding;

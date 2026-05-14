import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchStockProductsByTemplateOdoo, fetchStockProductCountOdoo } from '@api/services/generalApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
];

const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa', '#ddd6fe', '#fecaca'];
const tintFor = (id) => AVATAR_TINTS[Math.abs(Number(id) || 0) % AVATAR_TINTS.length];

const stateOf = (qty) => {
  if (qty <= 0) return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Out' };
  if (qty <= 5) return { bg: '#FEF3C7', fg: '#92400E', label: 'Low' };
  return { bg: '#DCFCE7', fg: '#166534', label: 'In Stock' };
};

const StockScreen = ({ navigation }) => {
  // Paginated against product.template — one row per template, no
  // client-side dedupe (page size matches what the user sees).
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(
    fetchStockProductsByTemplateOdoo
  );
  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, filter: filterRef.current }),
    400
  );

  const [filter, setFilter] = useState('all');
  const filterRef = useRef('all');
  const hasLoadedRef = useRef(false);
  const lastParamsRef = useRef({ searchText: '', filter: 'all' });
  const [failedImageIds, setFailedImageIds] = useState(() => new Set());
  const [totalCount, setTotalCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const changed =
        lastParamsRef.current.searchText !== searchText ||
        lastParamsRef.current.filter !== filter;
      if (!hasLoadedRef.current || changed) {
        fetchData({ searchText, filter });
        fetchStockProductCountOdoo({ searchText, filter }).then(setTotalCount);
        hasLoadedRef.current = true;
        lastParamsRef.current = { searchText, filter };
      }
    }, [searchText, filter])
  );

  useEffect(() => {
    console.log('[Stock]', {
      showing: data.length,
      total: totalCount,
      filter: { searchText, filter },
      loading,
    });
  }, [data.length, totalCount, loading, searchText, filter]);

  const handleFilterChange = (next) => {
    if (next === filter) return;
    filterRef.current = next;
    setFilter(next);
  };

  const handleLoadMore = () => fetchMoreData({ searchText, filter });

  const renderThumb = (item) => {
    if (!item.image_url || failedImageIds.has(item.id)) {
      const initial = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
      return (
        <View style={[styles.thumb, { backgroundColor: tintFor(item.id), alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={styles.thumbInitial}>{initial}</Text>
        </View>
      );
    }
    return (
      <Image
        source={{ uri: item.image_url }}
        style={styles.thumb}
        onError={() => {
          setFailedImageIds((prev) => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
          });
        }}
      />
    );
  };

  const renderItem = useCallback(({ item }) => {
    const qty = item.qty_available;
    const badge = stateOf(qty);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('StockDetail', { productId: item.id })}
      >
        {renderThumb(item)}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name || '—'}</Text>
          {item.default_code ? (
            <Text style={styles.code} numberOfLines={1}>{item.default_code}</Text>
          ) : null}
          <View style={[styles.statePill, { backgroundColor: badge.bg, marginTop: 4 }]}>
            <Text style={[styles.statePillText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>
        <View style={styles.qtyCol}>
          <Text style={[styles.qtyValue, { color: badge.fg }]}>{qty}</Text>
          {item.uom?.name ? <Text style={styles.qtyUom}>{item.uom.name}</Text> : null}
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
      </TouchableOpacity>
    );
  }, [failedImageIds, navigation]);

  const keyExtractor = useCallback((item, index) => `stock-${item.id || index}`, []);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));

  const csvEscape = (s) => {
    const str = String(s ?? '');
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  // Pull every row matching the current search + filter (the FlashList is
  // paginated so `data` only has what's been scrolled). We page through
  // until the API returns less than `limit`.
  const fetchAllForExport = async () => {
    const PAGE = 200;
    let offset = 0;
    const all = [];
    while (true) {
      const page = await fetchStockProductsOdoo({ offset, limit: PAGE, searchText, filter });
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
      if (offset > 5000) break; // hard safety cap
    }
    return all;
  };

  const filterLabel = (FILTERS.find((f) => f.key === filter) || {}).label || 'All';
  const reportTitle = filter && filter !== 'all'
    ? `Stock Report — ${filterLabel}`
    : 'Stock Report';
  const filterSlug = String(filter || 'all').replace(/_/g, '-');

  const buildHtml = (rows) => {
    const totalQty = rows.reduce((s, r) => s + (Number(r.qty_available) || 0), 0);
    const totalValue = rows.reduce(
      (s, r) => s + (Number(r.qty_available) || 0) * (Number(r.list_price) || 0),
      0
    );
    const dateStr = new Date().toLocaleString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const head = `
      <div style="margin-bottom:16px;">
        <div style="font-size:22px;font-weight:800;color:#2E294E;letter-spacing:0.3px;">${reportTitle}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">
          Filter: <b>${escapeHtml(filterLabel)}</b>${searchText ? ` &nbsp;·&nbsp; Search: <b>${escapeHtml(searchText)}</b>` : ''}
          &nbsp;·&nbsp; Generated: <b>${escapeHtml(dateStr)}</b>
          &nbsp;·&nbsp; Items: <b>${rows.length}</b>
        </div>
      </div>
    `;
    const tableRows = rows.map((r) => {
      const qty = Number(r.qty_available) || 0;
      const price = Number(r.list_price) || 0;
      const value = qty * price;
      return `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.default_code || '')}</td>
          <td>${escapeHtml(r.category?.name || '')}</td>
          <td style="text-align:right;">${qty}</td>
          <td>${escapeHtml(r.uom?.name || '')}</td>
          <td style="text-align:right;">${price.toFixed(2)}</td>
          <td style="text-align:right;">${value.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color:#1a1a2e; padding:24px; }
            table { width:100%; border-collapse:collapse; font-size:11px; }
            thead tr { background:#2E294E; color:#fff; }
            th, td { padding:8px 10px; border-bottom:1px solid #eef0f5; }
            th { text-align:left; font-size:10px; letter-spacing:0.5px; text-transform:uppercase; }
            tr:nth-child(even) td { background:#fafbfc; }
            tfoot td { font-weight:800; background:#fef3c7; border-top:2px solid #2E294E; }
          </style>
        </head>
        <body>
          ${head}
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Code</th>
                <th>Category</th>
                <th style="text-align:right;">On Hand</th>
                <th>UoM</th>
                <th style="text-align:right;">Sales Price</th>
                <th style="text-align:right;">Stock Value</th>
              </tr>
            </thead>
            <tbody>${tableRows || `<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:24px;">No data</td></tr>`}</tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total</td>
                <td style="text-align:right;">${totalQty}</td>
                <td></td>
                <td></td>
                <td style="text-align:right;">${totalValue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;
  };

  const buildCsv = (rows) => {
    const header = [
      'Product', 'Code', 'Category', 'On Hand', 'UoM', 'Sales Price', 'Stock Value',
    ];
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((r) => {
      const qty = Number(r.qty_available) || 0;
      const price = Number(r.list_price) || 0;
      const value = qty * price;
      lines.push([
        r.name || '',
        r.default_code || '',
        r.category?.name || '',
        qty,
        r.uom?.name || '',
        price.toFixed(2),
        value.toFixed(2),
      ].map(csvEscape).join(','));
    });
    return lines.join('\r\n');
  };

  const tsForFile = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  // Persist a file the user picked a save destination for. On Android we use
  // the StorageAccessFramework so the user gets a real "pick a folder" dialog.
  // On iOS (no SAF) we fall back to Sharing.shareAsync, whose share sheet
  // already exposes "Save to Files".
  const saveFile = async ({ srcUri, content, fileName, mimeType, isBase64 = false }) => {
    if (Platform.OS === 'android') {
      try {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perm?.granted) {
          const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
            perm.directoryUri,
            fileName,
            mimeType
          );
          let payload = content;
          let encoding = FileSystem.EncodingType.UTF8;
          if (isBase64) {
            // We were handed a source uri (PDF) — read its bytes as base64 and
            // write to the user-picked folder.
            payload = await FileSystem.readAsStringAsync(srcUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            encoding = FileSystem.EncodingType.Base64;
          }
          await FileSystem.writeAsStringAsync(newUri, payload, { encoding });
          Toast.show({ type: 'success', text1: 'Saved', text2: fileName, position: 'bottom' });
          return true;
        }
      } catch (e) {
        console.warn('SAF save failed, falling back to share:', e?.message || e);
      }
    }
    // iOS or Android user declined — open share sheet (which has "Save to Files").
    let uriToShare = srcUri;
    if (!uriToShare) {
      uriToShare = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uriToShare, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
    const can = await Sharing.isAvailableAsync();
    if (!can) {
      Toast.show({ type: 'error', text1: 'Sharing not available on this device', position: 'bottom' });
      return false;
    }
    await Sharing.shareAsync(uriToShare, {
      mimeType,
      dialogTitle: `Save ${fileName}`,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
    });
    return true;
  };

  const handleExportPdf = async () => {
    if (pdfBusy || xlsBusy) return;
    setPdfBusy(true);
    try {
      const rows = await fetchAllForExport();
      const html = buildHtml(rows);
      const { uri } = await Print.printToFileAsync({ html });
      const fileName = `stock-${filterSlug}-${tsForFile()}.pdf`;
      await saveFile({
        srcUri: uri,
        fileName,
        mimeType: 'application/pdf',
        isBase64: true,
      });
    } catch (e) {
      console.warn('PDF export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export PDF', text2: e?.message || '', position: 'bottom' });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (pdfBusy || xlsBusy) return;
    setXlsBusy(true);
    try {
      const rows = await fetchAllForExport();
      const csv = buildCsv(rows);
      const fileName = `stock-${filterSlug}-${tsForFile()}.csv`;
      await saveFile({
        content: csv,
        fileName,
        mimeType: 'text/csv',
        isBase64: false,
      });
    } catch (e) {
      console.warn('Excel export failed:', e?.message || e);
      Toast.show({ type: 'error', text1: 'Could not export Excel', text2: e?.message || '', position: 'bottom' });
    } finally {
      setXlsBusy(false);
    }
  };

  const renderFilters = () => (
    <View style={styles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flex: 1 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.85}
              onPress={() => handleFilterChange(f.key)}
              style={[
                styles.filterPill,
                active && { backgroundColor: NAVY, borderColor: NAVY },
              ]}
            >
              <Text style={[styles.filterPillText, active && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Export actions, opposite the filter pills */}
      <View style={styles.exportGroup}>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnPdf, (pdfBusy || xlsBusy) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={pdfBusy || xlsBusy}
          onPress={handleExportPdf}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {pdfBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="picture-as-pdf" size={14} color="#fff" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnXls, (pdfBusy || xlsBusy) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={pdfBusy || xlsBusy}
          onPress={handleExportExcel}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {xlsBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="grid-on" size={14} color="#fff" />
              <Text style={styles.exportBtnText}>Excel</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderList = () => {
    if (loading && (!data || data.length === 0)) return null;
    if ((!data || data.length === 0) && !loading) {
      return (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty_data.png')}
          message="No stock found"
        />
      );
    }
    return (
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 8, paddingBottom: 60 }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.8}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={92}
        ListFooterComponent={loading && data.length > 0 ? (
          <ActivityIndicator size="small" color={ORANGE} style={{ marginVertical: 16 }} />
        ) : null}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Stock" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Stock"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      <RoundedContainer>
        {renderFilters()}
        <View style={styles.countStrip}>
          <Text style={styles.countStripText}>
            {`Showing ${data.length}${totalCount ? ` of ${totalCount}` : ''}${loading ? ' · loading…' : ''}`}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          {renderList()}
        </View>
      </RoundedContainer>
      <OverlayLoader visible={loading && (!data || data.length === 0)} />
    </SafeAreaView>
  );
};

export default StockScreen;

const styles = StyleSheet.create({
  countStrip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
  },
  countStripText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  filterBar: {
    height: 48,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#eef0f5',
    marginLeft: 4,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 999,
    gap: 4,
  },
  exportBtnPdf: {
    backgroundColor: '#DC2626',
  },
  exportBtnXls: {
    backgroundColor: '#16A34A',
  },
  exportBtnText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 4,
    marginVertical: 5,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
    }),
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbInitial: {
    fontSize: 20,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  name: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  code: {
    fontSize: 12,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
  statePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statePillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  qtyCol: { alignItems: 'flex-end', marginRight: 6, minWidth: 56 },
  qtyValue: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  qtyUom: {
    fontSize: 11,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
});

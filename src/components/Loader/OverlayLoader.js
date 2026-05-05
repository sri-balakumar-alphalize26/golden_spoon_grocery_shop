import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { COLORS } from '@constants/theme';

const OverlayLoader = ({ visible, bakgroundColor = false, showPercent = true }) => {
    const [percent, setPercent] = useState(0);
    const tickRef = useRef(null);

    useEffect(() => {
        if (visible) {
            setPercent(0);
            // Ramp from 0 → 95 while the call is in flight. We don't have a
            // real progress signal, so we ease the bump as we approach 95
            // to feel responsive without ever claiming "done" prematurely.
            tickRef.current = setInterval(() => {
                setPercent((p) => {
                    if (p >= 95) return 95;
                    const remaining = 95 - p;
                    const step = Math.max(1, Math.round(remaining * 0.08));
                    return Math.min(95, p + step);
                });
            }, 120);
        } else {
            // Snap to 100 briefly when hidden so the animation feels complete.
            setPercent(100);
        }
        return () => {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
        };
    }, [visible]);

    if (!visible) return null;

    const backgroundColor = bakgroundColor ? 'rgba(0, 0, 0, 0.5)' : '';

    return (
        <View style={[styles.overlay, { backgroundColor }]}>
            <View style={styles.indicatorWrap}>
                <ActivityIndicator animating={true} size="large" color={COLORS.primaryThemeColor} />
                {showPercent && (
                    <Text style={styles.percentText}>{`${percent}%`}</Text>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    indicatorWrap: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    percentText: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.primaryThemeColor,
    },
});

export default OverlayLoader;

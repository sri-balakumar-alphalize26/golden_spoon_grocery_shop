import React, { useCallback, useState } from 'react'
import { View, StyleSheet, Dimensions, Image } from 'react-native'
import Carousel, { Pagination } from 'react-native-snap-carousel'
import { useFocusEffect } from '@react-navigation/native'
import { fetchAppBannersOdoo } from '@api/services/generalApi'
import { FeatureGate } from '@components/FeatureGate'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

// Bundled fallback so the carousel never renders empty — used while the
// Odoo `app.banner` fetch is in flight, when the module isn't installed,
// or when the admin hasn't uploaded any banners yet.
const FALLBACK_BANNERS = [
  { id: 'fallback-1', source: require('@assets/images/Home/Banner/Banner1.png') },
  { id: 'fallback-2', source: require('@assets/images/Home/Banner/Banner2.png') },
]

const CarouselPagination = () => {
  const [activeSlide, setActiveSlide] = useState(0)
  const [data, setData] = useState(FALLBACK_BANNERS)

  // Refetch every time the Home screen comes into focus so banners
  // added/edited/deleted (in the in-app admin tile OR in Odoo Web)
  // show up next time the cashier taps back to Home.
  useFocusEffect(
    useCallback(() => {
      let alive = true
      ;(async () => {
        console.log('[AppBanner] carousel focus refresh, fetching…')
        const remote = await fetchAppBannersOdoo()
        if (!alive) return
        if (Array.isArray(remote) && remote.length > 0) {
          console.log(`[AppBanner] carousel got ${remote.length} rows, switching from fallback`)
          setData(remote.map((b) => ({
            id: `remote-${b.id}`,
            source: { uri: `data:image/jpeg;base64,${b.image}` },
          })))
        } else {
          // No active rows / Odoo unreachable → fall back to bundled images.
          console.log('[AppBanner] carousel got 0 rows, using bundled fallback')
          setData(FALLBACK_BANNERS)
        }
      })()
      return () => { alive = false }
    }, [])
  )

  return (
    <FeatureGate featureKey="home.banner">
      <View style={styles.container}>
        <Carousel
          data={data}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image
                source={item.source}
                style={styles.image}
              />
            </View>
          )}
          sliderWidth={screenWidth}
          itemWidth={screenWidth - 60}
          autoplay
          loop
          autoplayInterval={3000}
          inactiveSlideScale={0.9}
          inactiveSlideOpacity={0.7}
          contentContainerCustomStyle={styles.carouselContent}
          activeSlideAlignment="center"
          onSnapToItem={setActiveSlide}
        />

        <Pagination
          dotsLength={data.length}
          activeDotIndex={activeSlide}
          containerStyle={styles.pagination}
          dotStyle={styles.dot}
          inactiveDotOpacity={0.3}
          inactiveDotScale={0.8}
        />
      </View>
    </FeatureGate>
  )
}

export default CarouselPagination

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    marginBottom: 0,
  },

  carouselContent: {
    paddingHorizontal: 10,
  },

  card: {
    height: screenHeight * 0.14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },

  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  pagination: {
    paddingVertical: 8,
    paddingBottom: 4,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
    backgroundColor: '#461c8aff',
  },
})

import React, { useCallback, useState } from 'react'
import { View, StyleSheet, Dimensions, Image } from 'react-native'
import Carousel, { Pagination } from 'react-native-snap-carousel'
import { useFocusEffect } from '@react-navigation/native'
import { fetchAppBannersOdoo } from '@api/services/generalApi'
import { FeatureGate } from '@components/FeatureGate'

const { width: screenWidth } = Dimensions.get('window')

const CarouselPagination = () => {
  const [activeSlide, setActiveSlide] = useState(0)
  const [data, setData] = useState([])

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
          console.log(`[AppBanner] carousel got ${remote.length} rows`)
          setData(remote.map((b) => ({
            id: `remote-${b.id}`,
            source: { uri: `data:image/jpeg;base64,${b.image}` },
          })))
        } else {
          // No active rows / Odoo unreachable → render nothing. The local
          // assets/images/Home/Banner folder is intentionally NOT used as
          // a fallback so the carousel only ever shows banner-module images.
          console.log('[AppBanner] carousel got 0 rows, hiding carousel')
          setData([])
        }
      })()
      return () => { alive = false }
    }, [])
  )

  if (data.length === 0) return null

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
    // Lock to 3:1 so the card's shape matches the BannerDetailsScreen
    // image-picker crop frame (also `aspect: [3, 1]`). Width is set by
    // Carousel's `itemWidth`, height is derived from aspectRatio.
    aspectRatio: 3,
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

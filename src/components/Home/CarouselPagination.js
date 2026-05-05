import React, { useState } from 'react'
import { View, StyleSheet, Dimensions, Image } from 'react-native'
import Carousel, { Pagination } from 'react-native-snap-carousel'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

const CarouselPagination = () => {
  const [activeSlide, setActiveSlide] = useState(0)

  const data = [
    { image: require('@assets/images/Home/Banner/slideshow1.png') },
    { image: require('@assets/images/Home/Banner/slideshow2.png') },
    { image: require('@assets/images/Home/Banner/slideshow3.png') },
    { image: require('@assets/images/Home/Banner/slideshow4.png') },
    { image: require('@assets/images/Home/Banner/slideshow5.png') },
  ]

  return (
    <View style={styles.container}>
      <Carousel
        data={data}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image
              source={item.image}
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
  )
}

export default CarouselPagination

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    marginBottom: 4,
  },

  carouselContent: {
    paddingHorizontal: 10,
  },

  card: {
    height: screenHeight * 0.28,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
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
    resizeMode: 'contain',
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

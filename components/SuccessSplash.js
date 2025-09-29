import React, { useEffect, useRef } from 'react'
import { Modal, View, StyleSheet, Animated, Easing, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import colors from '../theme/colors'

export default function SuccessSplash({ visible, onDone, duration = 900, message }) {
  const scale = useRef(new Animated.Value(0.6)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let t
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 12, bounciness: 8, useNativeDriver: true }),
      ]).start()
      t = setTimeout(() => { onDone && onDone() }, duration)
    } else {
      scale.setValue(0.6)
      opacity.setValue(0)
    }
    return () => { if (t) clearTimeout(t) }
  }, [visible])

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={() => onDone && onDone()}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}> 
          <Ionicons name="checkmark-circle" size={96} color={colors.successText} />
          {message ? <Text style={styles.msg}>{message}</Text> : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  msg: {
    marginTop: 8,
    color: colors.successText,
    fontSize: 16,
    fontWeight: '700',
  },
})


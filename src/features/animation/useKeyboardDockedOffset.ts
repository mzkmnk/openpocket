import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Keyboard, Platform } from "react-native";

type UseKeyboardDockedOffsetOptions = {
  defaultDurationMs?: number;
  onOffsetChange?: (offset: number, durationMs: number) => void;
};

/**
 * Tracks keyboard height and provides an animated offset suitable for docked footers.
 * キーボード高さを追跡し、下部固定フッターに適したアニメーションオフセットを提供します。
 *
 * @param options - Optional animation and callback settings.
 *                  アニメーション設定とコールバックの任意オプション。
 * @returns Current offset, animated value, and keyboard visibility flag.
 *          現在のオフセット、Animated 値、キーボード表示フラグ。
 */
export function useKeyboardDockedOffset(options: UseKeyboardDockedOffsetOptions = {}) {
  const { defaultDurationMs = 180, onOffsetChange } = options;

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const keyboardOffsetAnimated = useRef(new Animated.Value(0)).current;

  const applyOffset = useCallback(
    (next: number, durationMs?: number) => {
      const normalized = Math.max(0, next);
      const duration =
        typeof durationMs === "number" ? Math.max(80, durationMs) : defaultDurationMs;
      setKeyboardOffset(normalized);
      Animated.timing(keyboardOffsetAnimated, {
        toValue: normalized,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      onOffsetChange?.(normalized, duration);
    },
    [defaultDurationMs, keyboardOffsetAnimated, onOffsetChange],
  );

  useEffect(() => {
    const screenHeight = Dimensions.get("window").height;

    const computeKeyboardHeight = (screenY?: number, fallbackHeight?: number): number => {
      if (typeof screenY === "number") {
        return Math.max(0, screenHeight - screenY);
      }
      if (typeof fallbackHeight === "number") {
        return Math.max(0, fallbackHeight);
      }
      return 0;
    };

    if (Platform.OS === "ios") {
      const showSub = Keyboard.addListener("keyboardWillShow", (event) => {
        Keyboard.scheduleLayoutAnimation(event);
        const height = computeKeyboardHeight(
          event.endCoordinates?.screenY,
          event.endCoordinates?.height,
        );
        applyOffset(height, event.duration);
      });
      const changeSub = Keyboard.addListener("keyboardWillChangeFrame", (event) => {
        Keyboard.scheduleLayoutAnimation(event);
        const height = computeKeyboardHeight(
          event.endCoordinates?.screenY,
          event.endCoordinates?.height,
        );
        applyOffset(height, event.duration);
      });
      const hideSub = Keyboard.addListener("keyboardWillHide", (event) => {
        Keyboard.scheduleLayoutAnimation(event);
        applyOffset(0, event.duration);
      });

      return () => {
        showSub.remove();
        changeSub.remove();
        hideSub.remove();
      };
    }

    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = computeKeyboardHeight(
        event.endCoordinates?.screenY,
        event.endCoordinates?.height,
      );
      applyOffset(height, 120);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      applyOffset(0, 120);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [applyOffset]);

  return {
    keyboardOffset,
    keyboardOffsetAnimated,
    isKeyboardVisible: keyboardOffset > 0,
  };
}

import { useCallback, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";

const DEFAULT_CLOSED_Y = 420;
const DEFAULT_CLOSE_DURATION_MS = 180;

/**
 * Options for configuring shared bottom-sheet animation behavior.
 * 共通 bottom-sheet アニメーション挙動を設定するオプションです。
 */
export type BottomSheetMotionOptions = {
  /**
   * Off-screen translateY position when the sheet is fully closed.
   * シートが完全に閉じたときの画面外 translateY 位置です。
   */
  closedY?: number;
  /**
   * Close animation duration in milliseconds.
   * 閉じるアニメーションの時間（ミリ秒）です。
   */
  closeDurationMs?: number;
};

/**
 * Controller object returned by `useBottomSheetMotion`.
 * `useBottomSheetMotion` が返す制御オブジェクトです。
 */
export type BottomSheetMotionController = {
  /**
   * Animated translateY value for the sheet container.
   * シートコンテナ用の translateY アニメーション値です。
   */
  translateY: Animated.Value;
  /**
   * Derived backdrop opacity synchronized with sheet movement.
   * シート移動と同期した backdrop opacity の派生値です。
   */
  backdropOpacity: Animated.AnimatedInterpolation<number>;
  /**
   * Jumps the sheet to the configured closed position.
   * 設定済みの閉状態位置へシートを即時移動します。
   */
  setClosedPosition: () => void;
  /**
   * Plays opening animation (spring to visible position).
   * 開くアニメーション（表示位置への spring）を再生します。
   */
  animateIn: () => void;
  /**
   * Plays closing animation and optionally notifies completion.
   * 閉じるアニメーションを再生し、必要なら完了通知します。
   *
   * @param onFinished - Optional callback invoked when animation finished.
   *                     アニメーション完了時に呼び出す任意コールバック。
   */
  animateOut: (onFinished?: () => void) => void;
};

/**
 * Builds reusable bottom-sheet motion primitives for modal UIs.
 * モーダル UI 向けに再利用可能な bottom-sheet 動作プリミティブを構築します。
 *
 * @param options - Optional motion tuning options.
 *                  モーション調整用の任意オプション。
 * @returns Motion controller with animated values and helper callbacks.
 *          アニメーション値と補助コールバックを持つモーション制御オブジェクト。
 */
export function useBottomSheetMotion(
  options: BottomSheetMotionOptions = {},
): BottomSheetMotionController {
  const closedY = options.closedY ?? DEFAULT_CLOSED_Y;
  const closeDurationMs = options.closeDurationMs ?? DEFAULT_CLOSE_DURATION_MS;

  const translateY = useRef(new Animated.Value(closedY)).current;

  const backdropOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [0, closedY],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [closedY, translateY],
  );

  const setClosedPosition = useCallback(() => {
    translateY.setValue(closedY);
  }, [closedY, translateY]);

  const animateIn = useCallback(() => {
    translateY.stopAnimation();
    Animated.spring(translateY, {
      toValue: 0,
      damping: 20,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const animateOut = useCallback(
    (onFinished?: () => void) => {
      translateY.stopAnimation();
      Animated.timing(translateY, {
        toValue: closedY,
        duration: closeDurationMs,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onFinished?.();
        }
      });
    },
    [closeDurationMs, closedY, translateY],
  );

  return {
    translateY,
    backdropOpacity,
    setClosedPosition,
    animateIn,
    animateOut,
  };
}

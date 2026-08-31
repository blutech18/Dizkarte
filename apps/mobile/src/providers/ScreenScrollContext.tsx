import type { ReactNode, RefObject } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type ScrollView,
  type View,
} from "react-native";

export type ScreenScrollContextValue = {
  readonly scrollViewRef: RefObject<ScrollView | null>;
  readonly keyboardVisible: boolean;
  readonly keyboardHeight: number;
  readonly scrollToRef: (targetRef: RefObject<View | null> | View | null) => void;
};

export const ScreenScrollContext = createContext<ScreenScrollContextValue | null>(null);

export function useScreenScroll(): ScreenScrollContextValue | null {
  return useContext(ScreenScrollContext);
}

export type ScreenScrollProviderProps = {
  readonly scrollViewRef: RefObject<ScrollView | null>;
  readonly children: ReactNode;
};

export function ScreenScrollProvider({ scrollViewRef, children }: ScreenScrollProviderProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardHeightRef = useRef<number>(0);
  const lastFocusedTargetRef = useRef<RefObject<View | null> | View | null>(null);

  const performScroll = useCallback(
    (target: RefObject<View | null> | View | null) => {
      const node = target && "current" in target ? target.current : target;
      if (!node || !scrollViewRef.current) return;

      const runMeasure = () => {
        try {
          node.measureLayout(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scrollViewRef.current as unknown as any,
            (_x, y, _width, height) => {
              const { height: screenHeight } = Dimensions.get("window");
              const currentKbHeight =
                keyboardHeightRef.current > 0 ? keyboardHeightRef.current : 300;
              const visibleHeight = screenHeight - currentKbHeight;
              const targetTopInViewport = Math.max(24, (visibleHeight - height) / 2);
              const targetY = y - targetTopInViewport;
              scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
            },
            () => {},
          );
        } catch {
          // Ignore measurement errors gracefully
        }
      };

      runMeasure();
      setTimeout(runMeasure, 80);
    },
    [scrollViewRef],
  );

  const scrollToRef = useCallback(
    (targetRef: RefObject<View | null> | View | null) => {
      lastFocusedTargetRef.current = targetRef;
      performScroll(targetRef);
    },
    [performScroll],
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardVisible(true);
      const height = e?.endCoordinates?.height;
      if (height && height > 0) {
        keyboardHeightRef.current = height;
      }
      if (lastFocusedTargetRef.current) {
        performScroll(lastFocusedTargetRef.current);
      }
    };

    const onHide = () => {
      setKeyboardVisible(false);
      keyboardHeightRef.current = 0;
      lastFocusedTargetRef.current = null;
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [performScroll]);

  return (
    <ScreenScrollContext.Provider
      value={{
        scrollViewRef,
        keyboardVisible,
        keyboardHeight: keyboardHeightRef.current,
        scrollToRef,
      }}
    >
      {children}
    </ScreenScrollContext.Provider>
  );
}


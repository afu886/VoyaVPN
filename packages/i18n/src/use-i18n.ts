import { useSyncExternalStore } from "react";

import {
  changeLocale,
  getLocaleDirection,
  i18next,
  localeOptions,
  type Locale,
  type TranslationFunction,
} from "./index";

function subscribe(listener: () => void) {
  i18next.on("languageChanged", listener);

  return () => {
    i18next.off("languageChanged", listener);
  };
}

function getSnapshot() {
  return i18next.resolvedLanguage ?? i18next.language;
}

export function useI18n() {
  const language = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as Locale;
  const t: TranslationFunction = (key, options) => String(i18next.t(key, options));

  return {
    direction: getLocaleDirection(language),
    language,
    localeOptions,
    setLocale: changeLocale,
    t,
  };
}

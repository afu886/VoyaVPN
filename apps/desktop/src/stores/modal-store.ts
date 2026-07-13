import { create } from "zustand";

import type { CoreType } from "@/ipc/bindings";

export type ModalKind = "fullConfigTemplate" | "missingCore" | "settings";

export type SettingsTab = "core" | "general" | "hotkeys" | "network" | "sources" | "tests" | "updates";

export type MissingCorePayload = {
  coreType: CoreType;
  message: string;
};

export type ModalEntry = {
  id: string;
  kind: ModalKind;
  missingCore?: MissingCorePayload;
  settingsTab?: SettingsTab;
};

type ModalOptions = {
  missingCore?: MissingCorePayload;
  settingsTab?: SettingsTab;
};

type ModalState = {
  closeModal: (id: string) => void;
  closeTopModal: () => void;
  openModal: (kind: ModalKind, options?: ModalOptions) => string;
  setModalSettingsTab: (id: string, tab: SettingsTab) => void;
  stack: ModalEntry[];
};

function createModalId(kind: ModalKind) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useModalStore = create<ModalState>((set) => ({
  closeModal: (id) => set((state) => ({ stack: state.stack.filter((modal) => modal.id !== id) })),
  closeTopModal: () => set((state) => ({ stack: state.stack.slice(0, -1) })),
  openModal: (kind, options) => {
    const id = createModalId(kind);

    set((state) => ({
      stack: [
        ...state.stack,
        {
          id,
          kind,
          missingCore: options?.missingCore,
          settingsTab: options?.settingsTab,
        },
      ],
    }));

    return id;
  },
  setModalSettingsTab: (id, tab) =>
    set((state) => ({
      stack: state.stack.map((modal) => (modal.id === id ? { ...modal, settingsTab: tab } : modal)),
    })),
  stack: [],
}));

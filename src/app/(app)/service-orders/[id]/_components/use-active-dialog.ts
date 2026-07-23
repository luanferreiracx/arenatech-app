import { useCallback, useMemo, useState } from "react";

/**
 * Nomes dos dialogs da tela de detalhe da OS. Um por vez — a exclusão mútua é
 * estrutural (um único `activeDialog`), não uma convenção espalhada por 17
 * booleanos de `useState`.
 */
export type OrderDialog =
  | "cancel"
  | "uncancel"
  | "refund"
  | "addItem"
  | "budgetApproval"
  | "signature"
  | "tracking"
  | "deliveryTerm"
  | "returnTerm"
  | "techInfo"
  | "changeTech"
  | "sendLab"
  | "notifyDelivery"
  | "delete"
  | "conclude"
  | "notifyCompleted"
  | "receipt";

export type ActiveDialog = {
  /** Dialog aberto no momento, ou `null` se nenhum. */
  active: OrderDialog | null;
  /** Abre um dialog (fecha qualquer outro — só um abre por vez). */
  open: (dialog: OrderDialog) => void;
  /** Fecha o dialog atual. */
  close: () => void;
  /** `true` se o dialog informado é o que está aberto. */
  isOpen: (dialog: OrderDialog) => boolean;
  /**
   * Par `open`/`onOpenChange` pronto para um componente de Dialog (Radix/shadcn):
   * `<Dialog {...dialog.props("cancel")}>`. Fecha via `close()` quando o Radix
   * pede para fechar; abre o dialog nomeado quando pede para abrir.
   */
  props: (dialog: OrderDialog) => {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
};

/**
 * Estado do dialog ativo na tela de OS. Interface pequena, muito comportamento:
 * substitui 17 `useState<boolean>` + setters espalhados, concentra o invariante
 * "só um dialog aberto" num único lugar (locality) e dá aos chamadores um par
 * `props(name)` que elimina o `onOpenChange` repetitivo (leverage).
 */
export function useActiveDialog(): ActiveDialog {
  const [active, setActive] = useState<OrderDialog | null>(null);

  const open = useCallback((dialog: OrderDialog) => setActive(dialog), []);
  const close = useCallback(() => setActive(null), []);
  const isOpen = useCallback(
    (dialog: OrderDialog) => active === dialog,
    [active],
  );
  const props = useCallback(
    (dialog: OrderDialog) => ({
      open: active === dialog,
      onOpenChange: (nextOpen: boolean) =>
        nextOpen ? setActive(dialog) : setActive(null),
    }),
    [active],
  );

  return useMemo(
    () => ({ active, open, close, isOpen, props }),
    [active, open, close, isOpen, props],
  );
}

import type { KeyboardEvent } from "react";

/**
 * onKeyDown que dispara `handler` em Enter/Espaço. Use em elementos não-nativos
 * que agem como link/botão via onClick (ex.: <TableRow>, <div> clicável) junto
 * com role="link"|"button" e tabIndex={0}, para deixá-los acessíveis por
 * teclado (WCAG 2.1.1). Ignora repetição de tecla (auto-repeat).
 */
export function onActivateKey<T extends Element>(handler: () => void) {
  return (e: KeyboardEvent<T>) => {
    if (e.repeat) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}

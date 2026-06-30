"use client";

import { useEffect, useRef } from "react";

// Assets self-hosted (copiados de swagger-ui-dist no build — ver
// scripts/copy-swagger-assets.ts). Same-origin: nada de CDN externo.
const SWAGGER_CSS = "/swagger-ui/swagger-ui.css";
const SWAGGER_JS = "/swagger-ui/swagger-ui-bundle.js";

type SwaggerUIBundle = (config: {
  url: string;
  domNode: HTMLElement;
  deepLinking: boolean;
  defaultModelsExpandDepth: number;
}) => void;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("falha ao carregar Swagger UI")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("falha ao carregar Swagger UI")));
    document.head.appendChild(script);
  });
}

function loadStyleOnce(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Renderiza o Swagger UI apontando para a spec OpenAPI servida pelo app. Os assets
 * (CSS/JS) são self-hosted; a spec — o que importa para "amarrado" — é gerada pelo
 * nosso backend a partir dos schemas Zod.
 */
export function SwaggerViewer({ specUrl }: { specUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadStyleOnce(SWAGGER_CSS);
    loadScriptOnce(SWAGGER_JS)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const bundle = (window as unknown as { SwaggerUIBundle?: SwaggerUIBundle }).SwaggerUIBundle;
        if (!bundle) return;
        bundle({
          url: specUrl,
          domNode: containerRef.current,
          deepLinking: true,
          defaultModelsExpandDepth: 1,
        });
      })
      .catch(() => {
        if (containerRef.current) {
          containerRef.current.textContent =
            "Não foi possível carregar a documentação interativa. Tente recarregar a página.";
        }
      });
    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  return (
    <main style={{ minHeight: "100vh", background: "#fafafa" }}>
      <div ref={containerRef} />
    </main>
  );
}

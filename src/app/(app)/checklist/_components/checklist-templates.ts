export interface ChecklistField {
  id: string;
  tipo: "radio" | "checkbox" | "text" | "textarea" | "number";
  label: string;
  opcoes?: string[];
  obrigatorio: boolean;
  placeholder?: string;
  descricao?: string;
  min?: number;
  max?: number;
}

export interface ChecklistTemplate {
  titulo: string;
  campos: ChecklistField[];
}

export const CHECKLIST_TEMPLATES: Record<string, ChecklistTemplate> = {
  smartphone: {
    titulo: "Checklist - Smartphone",
    campos: [
      { id: "serial_confere", tipo: "radio", label: "IMEI / Numero de serie do aparelho confere com a caixa ou nota fiscal apresentada?", opcoes: ["Sim", "Nao", "Sem caixa/nota"], obrigatorio: true },
      { id: "liga_normalmente", tipo: "radio", label: "Liga normalmente?", opcoes: ["Sim", "Nao"], obrigatorio: true },
      { id: "tela_manchas", tipo: "radio", label: "A tela possui manchas? (teste com tela totalmente branca e totalmente preta)", opcoes: ["Nao possui manchas", "Manchas leves", "Manchas visiveis", "Manchas graves"], obrigatorio: true, descricao: "Coloque uma imagem totalmente branca e depois totalmente preta na tela para verificar" },
      { id: "tela_estado", tipo: "radio", label: "Tela sem riscos/trincas?", opcoes: ["Perfeita", "Riscos leves", "Riscos profundos", "Trincada"], obrigatorio: true },
      { id: "touch_funciona", tipo: "radio", label: "Touch screen funciona 100%?", opcoes: ["Sim", "Nao", "Parcialmente"], obrigatorio: true },
      { id: "face_touch_id", tipo: "radio", label: "Biometria funcionando? (Face ID / Touch ID / Impressao Digital)", opcoes: ["Sim", "Nao", "Nao testado"], obrigatorio: true },
      { id: "cameras", tipo: "radio", label: "Cameras funcionando (frontal e traseira)?", opcoes: ["Ambas OK", "Frontal com defeito", "Traseira com defeito", "Ambas com defeito"], obrigatorio: true },
      { id: "audio", tipo: "radio", label: "Alto-falantes e microfone OK?", opcoes: ["Sim", "Alto-falante com defeito", "Microfone com defeito", "Ambos com defeito"], obrigatorio: true },
      { id: "bateria_saude", tipo: "text", label: "Saude da Bateria", obrigatorio: false, placeholder: "Ex: 85%, Boa, etc.", descricao: "Se disponivel, verificar em Ajustes > Bateria" },
      { id: "botoes", tipo: "radio", label: "Botoes laterais funcionando?", opcoes: ["Todos OK", "Volume com defeito", "Liga/Desliga com defeito", "Multiplos defeitos"], obrigatorio: true },
      { id: "conector_carga", tipo: "radio", label: "Conector de carga OK?", opcoes: ["Sim", "Nao carrega", "Carrega com mau contato"], obrigatorio: true },
      { id: "carga_inducao", tipo: "radio", label: "Carregamento por inducao funciona? (se suportado)", opcoes: ["Sim", "Nao", "Nao suporta", "Nao testado"], obrigatorio: false },
      { id: "wifi_bluetooth", tipo: "radio", label: "WiFi e Bluetooth funcionando?", opcoes: ["Ambos OK", "WiFi com defeito", "Bluetooth com defeito", "Ambos com defeito"], obrigatorio: true },
      { id: "oxidacao", tipo: "radio", label: "Sinais de oxidacao/contato com agua?", opcoes: ["Nao", "Sinais leves", "Sinais graves"], obrigatorio: true },
      { id: "carcaca_estado", tipo: "radio", label: "Estado da carcaca", opcoes: ["Perfeita", "Riscos leves", "Riscos/amassados", "Danos graves"], obrigatorio: true },
      { id: "acessorios", tipo: "checkbox", label: "Acessorios que acompanham", opcoes: ["Cabo original", "Carregador", "Fones", "Caixa original", "Manuais"], obrigatorio: false },
      { id: "observacoes", tipo: "textarea", label: "Observacoes Gerais", obrigatorio: false, placeholder: "Informacoes adicionais relevantes..." },
    ],
  },
  notebook: {
    titulo: "Checklist - Notebook",
    campos: [
      { id: "serial_confere", tipo: "radio", label: "Numero de serie do aparelho confere com a caixa ou nota fiscal apresentada?", opcoes: ["Sim", "Nao", "Sem caixa/nota"], obrigatorio: true },
      { id: "liga_normalmente", tipo: "radio", label: "Liga normalmente?", opcoes: ["Sim", "Nao", "Demora para ligar"], obrigatorio: true },
      { id: "tela_manchas", tipo: "radio", label: "A tela possui manchas?", opcoes: ["Nao possui manchas", "Manchas leves", "Manchas visiveis", "Manchas graves"], obrigatorio: true },
      { id: "tela_estado", tipo: "radio", label: "Tela sem riscos/pixels mortos?", opcoes: ["Perfeita", "Riscos leves", "Pixels mortos", "Multiplos problemas"], obrigatorio: true },
      { id: "teclado", tipo: "radio", label: "Teclado funcionando 100%?", opcoes: ["Sim", "Teclas com defeito", "Backlight nao funciona", "Multiplos problemas"], obrigatorio: true },
      { id: "touchpad", tipo: "radio", label: "Touchpad funcionando?", opcoes: ["Sim", "Nao", "Parcialmente"], obrigatorio: true },
      { id: "webcam", tipo: "radio", label: "Webcam funcionando?", opcoes: ["Sim", "Nao", "Nao testado"], obrigatorio: true },
      { id: "audio", tipo: "radio", label: "Alto-falantes e microfone OK?", opcoes: ["Sim", "Alto-falante com defeito", "Microfone com defeito", "Ambos com defeito"], obrigatorio: true },
      { id: "bateria", tipo: "radio", label: "Bateria segura carga?", opcoes: ["Sim, segura bem", "Segura pouco tempo", "Nao segura", "Nao testado"], obrigatorio: true },
      { id: "portas_usb", tipo: "radio", label: "Portas USB funcionando?", opcoes: ["Todas OK", "Algumas com defeito", "Nenhuma funciona"], obrigatorio: true },
      { id: "wifi_bluetooth", tipo: "radio", label: "WiFi e Bluetooth funcionando?", opcoes: ["Ambos OK", "WiFi com defeito", "Bluetooth com defeito", "Ambos com defeito"], obrigatorio: true },
      { id: "carcaca_estado", tipo: "radio", label: "Estado da carcaca", opcoes: ["Perfeita", "Riscos leves", "Riscos/amassados", "Danos graves"], obrigatorio: true },
      { id: "acessorios", tipo: "checkbox", label: "Acessorios que acompanham", opcoes: ["Carregador original", "Mouse", "Bolsa/Case", "Caixa original", "Manuais"], obrigatorio: false },
      { id: "observacoes", tipo: "textarea", label: "Observacoes Gerais", obrigatorio: false, placeholder: "Especificacoes, problemas adicionais, etc..." },
    ],
  },
  console: {
    titulo: "Checklist - Console",
    campos: [
      { id: "serial_confere", tipo: "radio", label: "Numero de serie confere com caixa ou nota fiscal?", opcoes: ["Sim", "Nao", "Sem caixa/nota"], obrigatorio: true },
      { id: "liga_normalmente", tipo: "radio", label: "Liga normalmente?", opcoes: ["Sim", "Nao", "Demora para ligar"], obrigatorio: true },
      { id: "video", tipo: "radio", label: "Saida de video OK?", opcoes: ["Sim", "Sem imagem", "Imagem com defeito"], obrigatorio: true },
      { id: "audio", tipo: "radio", label: "Audio funcionando?", opcoes: ["Sim", "Nao", "Com ruidos"], obrigatorio: true },
      { id: "leitura_disco", tipo: "radio", label: "Le discos normalmente?", opcoes: ["Sim", "Nao", "As vezes", "Nao possui leitor"], obrigatorio: true },
      { id: "controles", tipo: "number", label: "Quantos controles acompanham?", obrigatorio: true, min: 0, max: 4 },
      { id: "controles_estado", tipo: "radio", label: "Estado dos controles", opcoes: ["Todos OK", "Com defeitos leves", "Com defeitos graves"], obrigatorio: false },
      { id: "wifi_online", tipo: "radio", label: "WiFi / Online funcionando?", opcoes: ["Sim", "Nao", "Nao testado"], obrigatorio: true },
      { id: "portas_usb", tipo: "radio", label: "Portas USB funcionando?", opcoes: ["Todas OK", "Algumas com defeito", "Nenhuma funciona"], obrigatorio: true },
      { id: "estado_fisico", tipo: "radio", label: "Estado fisico do console", opcoes: ["Perfeito", "Riscos leves", "Riscos/amassados", "Danos graves"], obrigatorio: true },
      { id: "acessorios", tipo: "checkbox", label: "Acessorios que acompanham", opcoes: ["Cabos (HDMI/AV)", "Fonte original", "Caixa original", "Jogos", "Manuais"], obrigatorio: false },
      { id: "observacoes", tipo: "textarea", label: "Observacoes Gerais", obrigatorio: false, placeholder: "Modelo especifico, HD/SSD, jogos inclusos, etc..." },
    ],
  },
  switch: {
    titulo: "Checklist - Nintendo Switch",
    campos: [
      { id: "serial_confere", tipo: "radio", label: "Numero de serie confere com caixa ou nota fiscal?", opcoes: ["Sim", "Nao", "Sem caixa/nota"], obrigatorio: true },
      { id: "liga_normalmente", tipo: "radio", label: "Liga normalmente?", opcoes: ["Sim", "Nao", "Demora para ligar"], obrigatorio: true },
      { id: "tela_manchas", tipo: "radio", label: "A tela possui manchas?", opcoes: ["Nao possui manchas", "Manchas leves", "Manchas visiveis", "Manchas graves"], obrigatorio: true },
      { id: "tela_estado", tipo: "radio", label: "Tela sem riscos/pixels mortos?", opcoes: ["Perfeita", "Riscos leves", "Pixels mortos", "Multiplos problemas"], obrigatorio: true },
      { id: "touch_funciona", tipo: "radio", label: "Touch screen funciona 100%?", opcoes: ["Sim", "Nao", "Parcialmente"], obrigatorio: true },
      { id: "audio", tipo: "radio", label: "Audio funcionando?", opcoes: ["Sim", "Alto-falantes com defeito", "Entrada de fone com defeito", "Ambos com defeito"], obrigatorio: true },
      { id: "dock_funciona", tipo: "radio", label: "Dock (base) funciona para TV?", opcoes: ["Sim", "Nao", "Sem dock", "Nao testado"], obrigatorio: true },
      { id: "leitura_cartucho", tipo: "radio", label: "Le cartuchos normalmente?", opcoes: ["Sim", "Nao", "As vezes", "Nao testado"], obrigatorio: true },
      { id: "joy_cons", tipo: "number", label: "Quantos Joy-Cons acompanham?", obrigatorio: true, min: 0, max: 4 },
      { id: "joy_cons_estado", tipo: "radio", label: "Estado dos Joy-Cons", opcoes: ["Todos OK", "Com drift (analogico)", "Botoes com defeito", "Multiplos problemas"], obrigatorio: false },
      { id: "bateria", tipo: "radio", label: "Bateria segura carga?", opcoes: ["Sim, segura bem", "Segura pouco tempo", "Nao segura", "Nao testado"], obrigatorio: true },
      { id: "wifi_online", tipo: "radio", label: "WiFi / Online funcionando?", opcoes: ["Sim", "Nao", "Nao testado"], obrigatorio: true },
      { id: "estado_fisico", tipo: "radio", label: "Estado fisico do console", opcoes: ["Perfeito", "Riscos leves", "Riscos/amassados", "Danos graves"], obrigatorio: true },
      { id: "acessorios", tipo: "checkbox", label: "Acessorios que acompanham", opcoes: ["Dock (base)", "Cabo HDMI", "Fonte original", "Alca para Joy-Con", "Caixa original", "Jogos", "Manuais"], obrigatorio: false },
      { id: "observacoes", tipo: "textarea", label: "Observacoes Gerais", obrigatorio: false, placeholder: "Modelo especifico (OLED, V2, Lite), memoria, jogos inclusos, etc..." },
    ],
  },
  smartwatch: {
    titulo: "Checklist - Smartwatch",
    campos: [
      { id: "serial_confere", tipo: "radio", label: "Numero de serie confere com caixa ou nota fiscal?", opcoes: ["Sim", "Nao", "Sem caixa/nota"], obrigatorio: true },
      { id: "liga_normalmente", tipo: "radio", label: "Liga normalmente?", opcoes: ["Sim", "Nao"], obrigatorio: true },
      { id: "tela_manchas", tipo: "radio", label: "A tela possui manchas?", opcoes: ["Nao possui manchas", "Manchas leves", "Manchas visiveis", "Manchas graves"], obrigatorio: true },
      { id: "tela_estado", tipo: "radio", label: "Tela sem riscos/trincas?", opcoes: ["Perfeita", "Riscos leves", "Riscos profundos", "Trincada"], obrigatorio: true },
      { id: "touch_funciona", tipo: "radio", label: "Touch screen funciona 100%?", opcoes: ["Sim", "Nao", "Parcialmente"], obrigatorio: true },
      { id: "sensores", tipo: "radio", label: "Sensores funcionando? (frequencia cardiaca, GPS, etc)", opcoes: ["Sim", "Nao", "Nao testado"], obrigatorio: true },
      { id: "bateria", tipo: "radio", label: "Bateria segura carga?", opcoes: ["Sim, segura bem", "Segura pouco tempo", "Nao segura"], obrigatorio: true },
      { id: "bluetooth", tipo: "radio", label: "Bluetooth funcionando?", opcoes: ["Sim", "Nao", "Nao testado"], obrigatorio: true },
      { id: "carcaca_estado", tipo: "radio", label: "Estado da carcaca", opcoes: ["Perfeita", "Riscos leves", "Riscos/amassados", "Danos graves"], obrigatorio: true },
      { id: "pulseira", tipo: "radio", label: "Pulseira original?", opcoes: ["Sim, em bom estado", "Sim, com desgaste", "Nao original", "Nao possui"], obrigatorio: true },
      { id: "acessorios", tipo: "checkbox", label: "Acessorios que acompanham", opcoes: ["Carregador original", "Pulseiras extras", "Caixa original", "Manuais"], obrigatorio: false },
      { id: "observacoes", tipo: "textarea", label: "Observacoes Gerais", obrigatorio: false },
    ],
  },
  airpods: {
    titulo: "Checklist - Fones / AirPods",
    campos: [
      { id: "funcionamento", tipo: "radio", label: "Ambos os lados funcionando?", opcoes: ["Sim", "Apenas um lado", "Nenhum funciona"], obrigatorio: true },
      { id: "audio_qualidade", tipo: "radio", label: "Qualidade do audio", opcoes: ["Perfeita", "Com chiados/ruidos", "Volume baixo", "Pessima"], obrigatorio: true },
      { id: "anc", tipo: "radio", label: "Cancelamento de ruido funcionando? (se suportado)", opcoes: ["Sim", "Nao", "Parcialmente", "Nao suporta"], obrigatorio: false },
      { id: "case_carrega", tipo: "radio", label: "Case carrega os fones?", opcoes: ["Sim", "Nao", "Parcialmente"], obrigatorio: true },
      { id: "case_bateria", tipo: "radio", label: "Bateria do case segura carga?", opcoes: ["Sim, segura bem", "Segura pouco tempo", "Nao segura"], obrigatorio: true },
      { id: "bluetooth", tipo: "radio", label: "Bluetooth pareia corretamente?", opcoes: ["Sim", "Nao", "Com dificuldade"], obrigatorio: true },
      { id: "estado_fisico", tipo: "radio", label: "Estado fisico dos fones e case", opcoes: ["Perfeito", "Riscos leves", "Riscos/amassados", "Danos graves"], obrigatorio: true },
      { id: "acessorios", tipo: "checkbox", label: "Acessorios que acompanham", opcoes: ["Cabo de carga", "Ponteiras extras", "Caixa original", "Manuais"], obrigatorio: false },
      { id: "observacoes", tipo: "textarea", label: "Observacoes Gerais", obrigatorio: false },
    ],
  },
};

export const CATEGORY_TO_TEMPLATE: Record<string, string> = {
  "iPhone": "smartphone",
  "Smartphone Android": "smartphone",
  "iPad": "smartphone",
  "MacBook": "notebook",
  "Notebook": "notebook",
  "Notebook Gamer": "notebook",
  "PC Gamer": "notebook",
  "Apple Watch": "smartwatch",
  "AirPods / Fones": "airpods",
  "PlayStation 4": "console",
  "PlayStation 5": "console",
  "Xbox": "console",
  "Nintendo Switch": "switch",
};

export const DEVICE_CATEGORIES = [
  { group: "Smartphones", items: ["iPhone", "Smartphone Android"] },
  { group: "Tablets", items: ["iPad"] },
  { group: "Computadores", items: ["MacBook", "Notebook", "Notebook Gamer", "PC Gamer"] },
  { group: "Wearables", items: ["Apple Watch", "AirPods / Fones"] },
  { group: "Consoles", items: ["PlayStation 4", "PlayStation 5", "Xbox", "Nintendo Switch"] },
];

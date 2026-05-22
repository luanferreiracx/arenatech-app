/**
 * Sugestao de NCM a partir do nome/categoria do produto.
 * Paridade Laravel ProdutoController::sugerirNcm + buscarNcmCurado.
 *
 * Mapeamento estatico keyword -> NCM. Ordem importa: a primeira categoria
 * com keyword matched eh retornada.
 */

interface NcmCategory {
  keywords: string[];
  ncm: string;
  descricao: string;
}

const CATEGORIES: NcmCategory[] = [
  { keywords: ["iphone", "smartphone", "celular", "telefone", "galaxy s", "galaxy a", "galaxy m", "galaxy z", "galaxy f", "redmi note", "redmi", "poco", "moto g", "moto e", "pixel", "nokia", "realme", "oneplus", "zenfone", "xperia"], ncm: "85171300", descricao: "Telefones inteligentes (smartphones)" },
  { keywords: ["tablet", "ipad", "galaxy tab", "kindle fire", "surface go", "tab s"], ncm: "84713012", descricao: "Maquinas portateis para processamento de dados (tablets)" },
  { keywords: ["notebook", "laptop", "macbook", "ultrabook", "chromebook", "thinkpad", "ideapad", "inspiron", "pavilion", "aspire", "vivobook", "zenbook", "swift", "nitro", "predator", "gaming laptop", "laptop gamer"], ncm: "84713012", descricao: "Computadores portateis (notebooks/laptops)" },
  { keywords: ["desktop", "pc gamer", "computador", "cpu", "gabinete", "imac", "mac mini", "mac pro", "mac studio", "nuc", "workstation", "all in one", "all-in-one"], ncm: "84713019", descricao: "Computadores de mesa (desktops)" },
  { keywords: ["smartwatch", "apple watch", "galaxy watch", "amazfit", "mi band", "smart band", "garmin", "fitbit", "pulseira inteligente", "relogio inteligente"], ncm: "91021290", descricao: "Relogios de pulso eletronicos (smartwatches)" },
  { keywords: ["microfone", "mic condensador", "mic dinamico", "microfono"], ncm: "85181090", descricao: "Microfones e seus suportes" },
  { keywords: ["fone", "headphone", "headset", "earphone", "earbud", "airpods", "airpod", "buds", "auscultador", "auricular", "in-ear", "over-ear", "on-ear", "tws", "bluetooth fone", "headset gamer"], ncm: "85183000", descricao: "Fones de ouvido e auriculares" },
  { keywords: ["soundbar", "sound bar", "barra de som"], ncm: "85182200", descricao: "Alto-falantes multiplos (soundbar)" },
  { keywords: ["caixa de som", "caixinha de som", "alto-falante", "alto falante", "speaker", "subwoofer", "woofer", "boombox", "echo", "alexa", "home pod", "homepod"], ncm: "85182100", descricao: "Alto-falante montado na sua caixa" },
  { keywords: ["carregador", "fonte", "charger", "fast charge", "carga rapida", "turbo power", "carregador wireless", "carregador sem fio", "carregador inducao"], ncm: "85044010", descricao: "Carregadores de acumuladores" },
  { keywords: ["fonte atx", "fonte pc", "fonte gamer", "psu", "adaptador de energia"], ncm: "85044090", descricao: "Conversores estaticos (fontes de alimentacao)" },
  { keywords: ["cabo", "cable", "lightning", "type-c", "tipo c", "tipo-c", "micro usb", "usb-c", "usb c", "hdmi", "displayport", "cabo de dados", "cabo de carga"], ncm: "85444200", descricao: "Cabos e condutores eletricos" },
  { keywords: ["adaptador", "hub usb", "dock", "dongle", "otg"], ncm: "85176299", descricao: "Aparelhos para conexao de redes e perifericos" },
  { keywords: ["pelicula", "pelicula", "vidro temperado", "protetor de tela", "screen protector", "hidrogel", "privacidade"], ncm: "39199090", descricao: "Peliculas e chapas autoadesivas de plastico" },
  { keywords: ["capa", "capinha", "case", "estojo", "bumper", "cover", "flip cover", "carteira", "wallet case", "anti impacto", "silicone", "tpu"], ncm: "42021210", descricao: "Estojos e capas de plastico" },
  { keywords: ["bateria", "battery", "power bank", "powerbank", "carregador portatil", "banco de energia"], ncm: "85076000", descricao: "Acumuladores de ion de litio" },
  { keywords: ["cartao de memoria", "memory card", "sd card", "micro sd", "microsd"], ncm: "85235110", descricao: "Cartoes de memoria" },
  { keywords: ["pendrive", "pen drive", "flash drive", "ssd", "hd externo", "disco rigido", "hard disk", "nvme", "armazenamento"], ncm: "85235190", descricao: "Dispositivos de armazenamento" },
  { keywords: ["memoria ram", "ram ddr", "ddr4", "ddr5", "sodimm", "dimm"], ncm: "85235190", descricao: "Memoria RAM" },
  { keywords: ["mousepad", "mouse pad"], ncm: "40169990", descricao: "Mousepads (borracha vulcanizada)" },
  { keywords: ["mouse", "trackpad", "trackball", "touchpad"], ncm: "84716053", descricao: "Indicadores ou apontadores" },
  { keywords: ["teclado", "keyboard", "keycap"], ncm: "84716052", descricao: "Teclados" },
  { keywords: ["monitor", "display", "ultrawide", "gaming monitor", "144hz", "240hz", "4k", "curvo"], ncm: "85285200", descricao: "Monitores para conexao a computadores" },
  { keywords: ["televisor", "televisao", "tv led", "smart tv", "oled tv", "qled"], ncm: "85287200", descricao: "Aparelhos receptores de televisao" },
  { keywords: ["tv box", "fire stick", "firestick", "chromecast", "roku", "mi box", "apple tv", "android tv"], ncm: "85219000", descricao: "TV Box/Streaming" },
  { keywords: ["impressora", "printer", "multifuncional", "scanner", "jato de tinta", "laser", "termica", "etiqueta"], ncm: "84433231", descricao: "Impressoras" },
  { keywords: ["webcam", "camera", "camera", "gopro", "action cam", "camera de seguranca", "filmadora", "camera ip"], ncm: "85258929", descricao: "Cameras digitais" },
  { keywords: ["drone", "dji"], ncm: "85258929", descricao: "Drones com camera" },
  { keywords: ["gps", "navegador", "rastreador", "tracker"], ncm: "85269100", descricao: "GPS" },
  { keywords: ["roteador", "router", "modem", "repetidor", "access point", "switch de rede", "hub de rede", "extensor wifi", "placa de rede", "mesh"], ncm: "85176241", descricao: "Roteadores" },
  { keywords: ["chip", "sim card", "simcard", "e-sim", "esim"], ncm: "85235110", descricao: "Cartoes inteligentes (smart cards)" },
];

export interface NcmSuggestion {
  ncm: string;
  descricao: string;
  matched: string[]; // keywords que casaram
}

/**
 * Retorna sugestoes de NCM baseado em texto livre (nome do produto, descricao).
 * Vazio se nenhuma keyword bate.
 */
export function suggestNcm(text: string): NcmSuggestion[] {
  const t = text.toLowerCase().trim();
  if (!t) return [];

  const results: NcmSuggestion[] = [];
  const seen = new Set<string>();
  for (const cat of CATEGORIES) {
    const matched = cat.keywords.filter((k) => t.includes(k));
    if (matched.length > 0 && !seen.has(cat.ncm)) {
      results.push({ ncm: cat.ncm, descricao: cat.descricao, matched });
      seen.add(cat.ncm);
    }
  }
  return results;
}

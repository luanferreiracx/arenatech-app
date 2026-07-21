-- Corrige nomes de produto com a marca duplicada no início.
--
-- Um import legado prependia "Apple " ao `name` a cada execução, produzindo nomes
-- como "Apple Apple Apple Apple iPhone 15". A marca já vive em coluna própria
-- (products.brand = 'Apple'), então o nome deve conter só o modelo.
--
-- Regra (decisão do dono):
--   1. Colapsar as repetições de "Apple " no início para uma única ocorrência.
--   2. Remover também esse "Apple" quando o modelo seguinte NÃO leva a marca no
--      nome canônico (iPhone, iPad, MacBook, iMac, AirPods, Mac, Magic). Ex.: "iPhone 15".
--   3. Manter um "Apple" quando o nome oficial do produto inclui a marca:
--      "Apple Watch" e "Apple Pencil". Ex.: "Apple Watch SE 3".
--
-- Idempotente e seguro em banco limpo: os WHERE só casam nomes já corrompidos,
-- então em qualquer ambiente sem esse padrão o UPDATE é no-op.

-- Passo 1: colapsar "Apple Apple ... " repetido no início para um único "Apple ".
UPDATE products
SET name = regexp_replace(name, '^(Apple )(Apple )+', 'Apple ', 'i')
WHERE name ~* '^(Apple ){2,}';

-- Passo 2: remover o "Apple" remanescente quando o modelo não o carrega no nome.
-- Word boundary (\y) evita casar prefixos parciais. Watch e Pencil ficam de fora
-- de propósito: "Apple Watch" e "Apple Pencil" são os nomes canônicos.
UPDATE products
SET name = regexp_replace(name, '^Apple (\y(iPhone|iPad|MacBook|iMac|AirPods|Mac|Magic)\y)', '\1', 'i')
WHERE name ~* '^Apple \y(iPhone|iPad|MacBook|iMac|AirPods|Mac|Magic)\y';

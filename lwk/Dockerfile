FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# wallet_data eh um volume montado em runtime (contem mnemonic/descriptor —
# secrets que NUNCA vao na imagem). So garante o diretorio.
RUN mkdir -p /app/wallet_data

EXPOSE 5000

CMD ["python", "app.py"]

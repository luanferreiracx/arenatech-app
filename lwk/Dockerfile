FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Usuario nao-root: limita o blast radius se a app for comprometida
# (o mnemonic vive no volume; rodar como root daria acesso total ao host).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/wallet_data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

# gunicorn com 1 worker: a carteira tem estado em disco (cache lwk) e UM
# unico writer — multi-worker reintroduziria o risco de double-spend.
# A serializacao fina (WALLET_LOCK) protege threads dentro do worker.
# --threads 4 atende requests concorrentes; o lock serializa o critico.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "120", "app:app"]

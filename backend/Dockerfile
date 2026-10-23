FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# cria tabelas + seed (idempotente) e sobe a API
CMD ["sh", "-c", "python -m app.seed.carregar && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

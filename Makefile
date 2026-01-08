.PHONY: help build run test clean docker-build docker-run

help:
	@echo "可用命令:"
	@echo "  make build          - 构建后端和前端"
	@echo "  make run            - 运行开发服务器"
	@echo "  make test           - 运行测试"
	@echo "  make clean          - 清理构建文件"
	@echo "  make docker-build   - 构建 Docker 镜像"
	@echo "  make docker-run     - 运行 Docker 容器"

build:
	@echo "构建后端..."
	cd backend && cargo build --release
	@echo "构建前端..."
	cd frontend && npm run build

run:
	@echo "启动开发服务器..."
	@echo "后端: http://localhost:3000"
	@echo "前端: http://localhost:5173"
	@make -j2 run-backend run-frontend

run-backend:
	cd backend && cargo run

run-frontend:
	cd frontend && npm run dev

test:
	@echo "运行后端测试..."
	cd backend && cargo test --lib -- --nocapture
	@echo "运行前端测试..."
	cd frontend && npm run test -- --run

test-unit:
	@echo "运行后端单元测试..."
	cd backend && cargo test --lib
	@echo "运行前端单元测试..."
	cd frontend && npm run test -- --run

test-integration:
	@echo "运行后端集成测试..."
	cd backend && cargo test --test '*'
	@echo "运行前端集成测试..."
	cd frontend && npm run test -- --run

test-e2e:
	@echo "运行 E2E 测试..."
	cd frontend && npm run test:e2e

test-coverage:
	@echo "生成后端覆盖率..."
	cd backend && cargo install cargo-tarpaulin && cargo tarpaulin --out Html
	@echo "生成前端覆盖率..."
	cd frontend && npm run test:coverage

test-all: test test-e2e test-coverage

clean:
	@echo "清理构建文件..."
	cd backend && cargo clean
	cd frontend && rm -rf dist node_modules/.vite

docker-build:
	@echo "构建 Docker 镜像..."
	docker build -t media-toolbox:latest .

docker-run:
	@echo "运行 Docker 容器..."
	docker-compose up -d

docker-stop:
	@echo "停止 Docker 容器..."
	docker-compose down

docker-logs:
	docker-compose logs -f

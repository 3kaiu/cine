fn main() {
    // 告诉 Cargo 如果 migrations 目录改变，重新运行构建脚本
    println!("cargo:rerun-if-changed=migrations");
}

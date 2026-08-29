# 数据目录

真实纳新问卷包含姓名、学号、手机号与来源 IP，不进入 Git 仓库。

本地开发时可将原始 XLSX 放入 `data/原始面试数据/`，并生成私有的 `apps/api/app/seed_questionnaire.json`。这两个路径都已加入 `.gitignore`。

公开代码默认使用 `apps/api/app/seed_questionnaire.example.json` 中的合成演示数据。

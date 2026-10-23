# 自动控制原理真题错题

支持本机提供的 73 页中国计量大学 801 真题扫描件。按已核对的红叉、红斜线选题，不按红色得分、扣分数字选题，也不将黑叉作为红色错题标记。当前共 31 道整题：2005 年 5 道、2006 年 4 道、2007 年 4 道、2008 年 2 道、2009 年 6 道、2010 年 3 道、2011 年 7 道。

在「PDF导入」选择原卷，新建「自动控制原理真题错题」，核对预览后入库；无需选择答案目录。小问标记保留整个大题，跨页题保留所有题干、图表和小问。本次不附参考答案，可继续使用思路记录与复习评分。

每张裁切图通过独立 `questionPageRefs` 指向已保存的来源整页。来源同时保留 PDF 页码与试卷册印刷页码，例如 PDF 第 18–19 页对应试卷册第 17–18 页。2005 年按原卷的“计算题”区分题号；2007 年第一大题保留两小题。原 PDF 移动后，已保存的整页仍可查看。

识别规则绑定资料内容指纹和人工核对目录 `control_exam_catalog.json`。97 条原始红色笔迹逐条核对，56 条叉线归并为 31 题，其余分别记录为得分、图中补充、划线、小点或目录笔迹。新出现的未知红色笔迹列入待核对，不推断其是分数还是叉线。后续增加批注需补充核验目录，已有题目按稳定身份去重。

题库与图片沿用现有 version 2 备份恢复流程；旧格式仍可读取。

验证：`npm run verify:port-prep`，以及 `.venv-pdf-import/bin/python -m unittest discover -s scripts/pdf_import -p 'test_*.py'`。真实图片隔离测试：设置 `MATHLOOP_QA_ROOT` 为复制的数据库目录、`MATHLOOP_QA_MANIFEST_DIR` 为识别暂存目录，运行 `cargo test --manifest-path src-tauri/Cargo.toml real_control_manifest_roundtrip_on_isolated_copy -- --ignored`。

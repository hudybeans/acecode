## ADDED Requirements

### Requirement: 私有文件支持原子替换

Windows 上限制访问权限的原子文件写入 SHALL 允许当前用户在可修改父目录中完成写入与替换，且不向其他主体增加访问权限。

#### Scenario: 父目录不授予删除子项权限
- **WHEN** 当前用户可以创建文件，但父目录未授予 FILE_DELETE_CHILD
- **THEN** 首次私有写入和后续私有替换均成功，读取结果为最近写入的完整内容
- **AND** 文件受保护 DACL 仅允许当前用户读取、写入和删除

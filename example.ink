INCLUDE Bootstrap.ink

=== start ===
欢迎来到测试故事！
@setBackground image=forest.jpg
你来到了一片神秘的森林。
@playSound sound=birds.mp3 volume=0.5
旁白: 这里的空气中弥漫着花香。

* [选择正确的路径] -> correct_path
* [选择错误的路径] -> wrong_path
* [测试Bootstrap] -> bootstrap_start

= correct_path
@showCharacter name=导游 position=left
你选择了正确的路径。
导游: 很好，跟我来！
导游: 我会带你去一个安全的地方。
玩家: 谢谢你的帮助。
@hideCharacter name=导游
旁白: 你跟着导游继续前进。
-> END

= wrong_path
你选择了错误的路径。
@playSound sound=error.mp3
这里看起来很危险。
神秘声音: 离开这里，否则后果自负！
旁白: 你感到一阵寒意。
-> END

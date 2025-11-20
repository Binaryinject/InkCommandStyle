// Ink示例文件 - 用于测试语法高亮和跳转功能
=== start ===
这是故事的开始。

VAR player_health = 100
VAR has_key = false

你站在一座神秘的城堡前。

* [进入城堡] -> enter_castle
* [绕着城堡走] -> walk_around
+ [离开这里] -> END

=== enter_castle ===
你推开了厚重的大门。

守卫: 站住！这里是禁区！
主角: 我有重要的事情要做。
守卫: 那你得先通过我这一关。

= hall
大厅里很安静。

{ has_key:
    你手里的钥匙发出微光。
- else:
    也许这里有什么有用的东西。
}

* [检查房间] -> check_room
* [上楼] -> upstairs
- -> hall

= check_room
你在房间里找到了一把古老的钥匙！
~ has_key = true
-> hall

= upstairs
你走上楼梯。
-> DONE

=== walk_around ===
你绕着城堡走了一圈，什么也没发现。
-> start

// 这是注释
/* 这是
   多行注释 */

# tag_example
TODO: 添加更多内容

// 自定义命令示例 - 测试高亮
@命令 参数1=21 参数2=你好
@播放音效 音效名称=爆炸 音量=100 循环=false
@显示图片 图片路径=bg/castle.png 位置=center 淡入时间=1.5
@设置变量 变量名=score 值=999
@跳转场景 场景=boss_fight 难度=hard

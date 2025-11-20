->start
=== start ===
你来到了一座神秘的古堡前。

* [敲门] -> knock_door
* [绕到后面] -> back_entrance
* [离开] -> END

= knock_door
你敲了敲门，一个老管家打开了门。
管家: 欢迎，主人正在等你。
* [进入] -> enter_hall
* [询问主人是谁] -> ask_about_master

= back_entrance
你绕到古堡后面，发现了一扇小门。
* [推开小门] -> secret_passage
* [返回正门] -> start

= enter_hall
你走进了富丽堂皇的大厅。
-> END

= ask_about_master
管家: 这个...恐怕我不能说。
* [强行进入] -> enter_hall
* [礼貌离开] -> END

= secret_passage
门吱呀一声打开了，里面s漆黑一片s。
-> END

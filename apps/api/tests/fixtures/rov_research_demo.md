# 水下机器人调研报告

本小组比较了 ROV、AUV 与水下滑翔机。ROV 通过脐带缆通信并获得持续能源，适合人工实时操控；AUV 依靠电池、导航传感器与自主控制完成较大范围任务。水下滑翔机通过调节浮力完成低功耗航行。

## 系统结构

系统由密封舱、能源模块、主控制器、深度与姿态传感器、推进器、水下通信模块组成。推进控制需要结合姿态反馈形成闭环；水下无线通信带宽有限，因此近距离调试可使用有缆方案。

## 案例比较与建议

有缆 ROV 的优点是通信稳定、续航时间长，缺点是缆绳会限制活动范围。AUV 的优点是自主性强，缺点是导航定位和失联保护更复杂。建议社团第一阶段优先完成小型水池 ROV，验证密封、推进、供电和控制方案，再逐步加入自主导航。

## 参考资料

1. WHOI，Autonomous Underwater Vehicles，https://www.whoi.edu/what-we-do/explore/underwater-vehicles/auvs/
2. NOAA Ocean Exploration，Remotely Operated Vehicles，https://oceanexplorer.noaa.gov/technology/subs/rov/rov.html
3. Blue Robotics Documentation，https://bluerobotics.com/learn/

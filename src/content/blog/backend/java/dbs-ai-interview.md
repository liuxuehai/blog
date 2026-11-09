---
title: "星展银行 AI 面试准备：中文行为题、英语口语与 Java/SQL 编程题"
titleEn: "DBS AI Interview Preparation: Behavioral, English, Java and SQL Questions"
description: "结合 15 年 Java 架构经验、供应链金融经历和 Bot、Trader、Account Manager、Mark 等个人项目，整理星展银行 AI 面试的完整准备稿。"
descriptionEn: "A practical DBS AI interview guide tailored to 15 years of Java architecture experience and several personal engineering projects."
pubDate: 2026-11-09
updatedDate: 2026-11-09
category: Backend
tags:
  - Java
  - SQL
  - 面试
  - AI 面试
  - 架构
  - DBS
featured: true
draft: false
toc: true
---

这套星展银行 AI 面试可以按三个部分准备：中文行为面试、英语口语和在线编程。回答的重点不是把经历讲得夸张，而是让面试官听清楚三件事：我做过什么、为什么这样做、结果如何。

下面的答案基于我的简历经历进行改写，涉及广州致景的盘古供应链业财中心、平安汽车金融核心系统，以及 Bot、Trader、Account Manager、Mark 等个人项目。正式面试时应根据真实情况替换细节和数据。

## 一、四分钟中文回答框架

每道题可以按“结论 - 背景 - 行动 - 结果 - 复盘”回答。前 20 秒先给结论，接着用 2 分钟讲事实，最后用 30-60 秒总结方法和岗位匹配度。不要在没有回答完之前点击下一题；如果剩余时间较多，可以主动补充结果、取舍和复盘。

### 第 1 题：三个目标只能优先完成一个，选什么？

我会优先选择**选项二：完成核心功能的微调与优化，确保产品稳定、流畅**。

产品开发中期，核心功能已经是用户价值和业务链路的基础。如果功能不稳定，营销带来的用户会直接遇到故障，用户调研得到的反馈也很难区分是产品方向问题还是体验问题。因此我会先用线上错误率、接口成功率、P95 延迟、核心流程转化率和客服问题分布确认最影响用户的环节，集中力量解决高影响问题。

我在平安汽车金融参与核心系统微服务重构和合同档案平台优化时，采用过类似的优先级方法：先梳理贷款、合同、档案的关键链路，识别接口调用、数据库访问和合同生成中的瓶颈，再按影响范围和改造风险分阶段推进。这样做的好处是先守住系统稳定性，再用小范围用户反馈验证改动，最后把市场分析和更大范围的调研纳入下一轮。

如果监控显示核心功能已经稳定，我会把第二优先级交给选项三，因为一线用户反馈能帮助团队确认优化方向；市场分析则与销售和产品一起持续推进，而不是完全暂停。

### 第 2 题：你适合这份工作吗？为什么？

我认为自己适合这份工作，原因有三点。

第一，我有长期的 Java 后端和架构实践，能够从业务建模、领域边界、接口和数据设计一直推进到开发、联调、上线和运维。过去 15 年里，我做过供应链金融、汽车金融、支付和供应链业财系统，熟悉金融场景对正确性、审计性、稳定性和连续性的要求。

第二，我有复杂项目的协作和交付经验。在广州致景，我带领约 15 人团队从 0 到 1 建设盘古业财中心，拆分应收、收款、清分、应付、核销、退款等 10 多个核心模块，并通过 RocketMQ、Feign、Kubernetes 和 GitLab CI/CD 形成可持续交付链路。在平安，我参与核心系统微服务重构和双活改造，能够和产品、测试、运维及外部系统共同推进落地。

第三，我持续保持工程学习能力。我的 Bot 项目实践了 Coordinator-Worker、多 Agent 调度和权限控制，Account Manager 处理多模型、多账号和协议转换，Trader 关注可回放、可审计的交易链路，Mark 则积累了全栈和 Serverless 经验。这些项目让我能够快速理解新业务，并用合适的技术解决实际问题。

我希望在星展银行继续发挥架构设计、系统治理和跨团队交付能力，同时深入理解国际化金融业务和更高标准的工程实践。

### 第 3 题：团队目标和个人利益不一致时怎么做？

我遇到过类似情况。在一次核心系统改造中，个人更希望先重构自己熟悉的模块，因为这样更容易快速产出；但团队当期目标是先解决主链路稳定性和跨系统联调风险。继续按个人偏好推进，会让局部代码变漂亮，却不能减少整体交付风险。

我的做法是先把个人方案放回团队目标中评估：列出影响范围、依赖关系、上线风险和可验证指标，再和负责人确认优先级。最终我把重构拆成两部分，先完成接口契约、异常处理和监控补齐，保证主链路按期上线；结构性重构放到后续迭代，并补充了技术债清单和验收标准。

我这样做的原因是团队交付结果高于个人偏好。个人成长并没有被牺牲，反而通过拆分任务、推动评审和复盘，把个人方案沉淀成了团队可复用的设计规范。我的 Bot 和 Account Manager 项目也采用同样原则：先把权限、产物登记、请求日志等基础闭环做好，再逐步扩展高级能力。

### 第 4 题：最具挑战性的任务是什么？

我认为最具挑战的是从 0 到 1 建设盘古供应链业财中心。它不是单一功能，而是要把入库、出库、开票、生产报工和平台订单等业务活动，转换为应收、应付和财务适配数据，同时还要和 FSSC、金蝶等外部系统协作。

我先和产品及业务人员梳理客户、供应商、平台三类主体，再按业务事实和财务结果划分应收、收款、清分、应付、付款申请、预收预付、核销、退款、金额占用和订单费用等领域。跨域通知使用 RocketMQ 传递业务事件，收付款和财务适配使用 Feign 协作，并明确同步链路、异步链路、幂等策略和异常补偿。团队通过方案评审、Code Review、联调清单和上线检查控制风险。

最终完成了 10 多个核心模块及 FSSC、金蝶集成，建立了从订单履约到财务核算的闭环。这个任务让我认识到，复杂系统的难点往往不是某一段代码，而是业务边界、数据归属、失败处理和团队协作能否保持一致。

### 第 5 题：时间紧、任务重时，如何平衡效率和细节？

在汽车金融核心系统和双活改造中，我遇到过时间紧、链路长、参与方多的情况。我会先把任务按业务影响和风险分级：主链路、数据正确性、故障恢复属于必须优先保证的部分；低频优化和非关键重构可以后置。

执行时我会把大任务拆成可验收的小步骤，先确定接口契约、数据校验、超时重试、监控指标和回滚方案，再并行推进开发与联调。对于关键模块，我会保留 Code Review、自动化测试和灰度验证；对于低风险改动，则使用模板、脚手架和自动化检查提高速度。

我的个人项目也采用这种方式。Account Manager 先保证账号选择、协议转换、上游执行和请求日志闭环，再扩展更多账号域；Trader 先保证策略信号到订单执行的可回放链路，再增加分析能力。这样既能按期交付，也不会为了赶进度跳过最重要的质量控制。

## 二、英语口语参考答案

英语题每题限时 4 分钟，但答案应控制在 30-60 秒内，留出检查和补充时间。语速稳定，句子短一些，优先保证准确、完整和自然停顿。

### 1. 句子复述

原句：

> Greece, home of the ancient Olympics, hosted the first modern Olympics in 1896.

复述：

> Greece, which was the birthplace of the ancient Olympics, hosted the first modern Olympic Games in 1896.

### 2. What are the advantages of online learning?

> Online learning has several advantages. First, it is flexible. People can choose when and where to study, so it is easier to balance learning with work and family responsibilities. Second, online courses give learners access to a wide range of teachers and materials. They can replay lessons, search for additional resources, and learn at their own pace. Third, online learning can reduce travel and accommodation costs. Of course, learners need self-discipline and a reliable internet connection, but with a clear schedule, online learning can be efficient and convenient.

### 3. 转述合作观点

关键词：collaboration / utmost importance / team / share insights and expertise

> The female employee believes that collaboration is extremely important in a team. In her view, the best results happen when team members work together and share their insights and expertise. She thinks that combining different knowledge and experience creates better outcomes than working separately.

## 三、在线编程题准备

### Java：使用 JUC 锁交替打印奇数和偶数

题目要求在同一个类中使用 `java.util.concurrent.locks` 下的锁，让两个线程交替打印奇数和偶数。核心是用同一把 `ReentrantLock` 保护共享状态，用两个 `Condition` 分别等待奇数线程和偶数线程。

```java
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class AlternatePrinter {
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition oddTurn = lock.newCondition();
    private final Condition evenTurn = lock.newCondition();
    private boolean odd = true;

    public void printOdd(int max) {
        for (int i = 1; i <= max; i += 2) {
            lock.lock();
            try {
                while (!odd) {
                    oddTurn.await();
                }
                System.out.println(i);
                odd = false;
                evenTurn.signal();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } finally {
                lock.unlock();
            }
        }
    }

    public void printEven(int max) {
        for (int i = 2; i <= max; i += 2) {
            lock.lock();
            try {
                while (odd) {
                    evenTurn.await();
                }
                System.out.println(i);
                odd = true;
                oddTurn.signal();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } finally {
                lock.unlock();
            }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        AlternatePrinter printer = new AlternatePrinter();
        int max = 10;

        Thread oddThread = new Thread(() -> printer.printOdd(max), "odd-thread");
        Thread evenThread = new Thread(() -> printer.printEven(max), "even-thread");

        oddThread.start();
        evenThread.start();
        oddThread.join();
        evenThread.join();
    }
}
```

面试时要说明三个细节：使用 `while` 而不是 `if` 防止虚假唤醒；在 `finally` 中释放锁；捕获中断后恢复中断标记。若题目要求打印到 `N`，奇数线程和偶数线程的循环边界都应以 `N` 为准。

### SQL：查询连续出现 3 次及以上的 name

表结构为 `info(id, name)`，其中 `id` 自增。下面是 MySQL 8+ 的写法，先按 `id` 排序，再用“岛屿分组”识别连续区间，最后只保留长度不少于 3 的区间，并按 `name` 升序返回。

```sql
WITH ordered AS (
    SELECT
        id,
        name,
        ROW_NUMBER() OVER (ORDER BY id) AS seq,
        ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS name_seq
    FROM info
), islands AS (
    SELECT
        name,
        seq - name_seq AS group_id,
        COUNT(*) AS occurrence_count
    FROM ordered
    GROUP BY name, seq - name_seq
    HAVING COUNT(*) >= 3
)
SELECT name
FROM islands
GROUP BY name
ORDER BY name ASC;
```

`seq - name_seq` 在同一个连续区间内保持不变，因此可以把相邻的同名记录归到同一组。最后按 `name` 分组，避免同一个名称有多个连续区间时重复返回。若数据库版本不支持窗口函数，可以使用自连接或用户变量实现，但面试中应先确认数据库版本和“连续”的定义。

## 四、最后的准备清单

- 中文题：每题准备一个真实案例，记住背景、自己的动作、结果和复盘，不要背长稿。
- 英语题：练习短句、停顿和关键词复述，先保证完整，再追求复杂表达。
- Java 题：熟悉锁、`Condition`、`wait/notify`、线程中断和死锁条件。
- SQL 题：掌握窗口函数、分组聚合、连续区间和索引基础。
- AI 面试：看清倒计时和按钮状态，回答结束后再进入下一题；如果被追问，继续围绕事实、取舍和结果展开。

我的经历适合强调“复杂金融业务 + 稳定性治理 + 架构落地 + 持续学习”这条主线。回答时应优先使用盘古业财中心和汽车金融双活改造作为工作案例，再用 Bot、Trader、Account Manager、Mark 证明自己在业余时间仍持续进行系统设计和工程实践。

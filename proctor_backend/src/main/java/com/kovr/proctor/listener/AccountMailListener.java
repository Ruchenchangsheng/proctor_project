package com.kovr.proctor.listener;

import com.kovr.proctor.domain.event.AccountCreatedEvent;
import com.kovr.proctor.service.MailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;
/**
 * AccountMailListener 监听账号创建事件，并触发账号通知邮件发送。
 */

@Component
@RequiredArgsConstructor
@Slf4j
public class AccountMailListener {
    private final MailService mail;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onAccountCreated(AccountCreatedEvent ev){
        boolean ok = mail.sendAccount(ev.to(), ev.name(), ev.domain(), ev.rawPwd());
        if (!ok) log.warn("发送邮箱到 ：{}  失败", ev.to());
    }
}

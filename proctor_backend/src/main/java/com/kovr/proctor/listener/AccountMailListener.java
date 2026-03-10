package com.kovr.proctor.listener;

import com.kovr.proctor.domain.event.AccountCreatedEvent;
import com.kovr.proctor.service.MailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;

@Component
@RequiredArgsConstructor
@Slf4j
public class AccountMailListener {
    private final MailService mail;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onAccountCreated(AccountCreatedEvent ev){
        boolean ok = mail.sendAccount(ev.to(), ev.name(), ev.domain(), ev.rawPwd());
        if (!ok) log.warn("发送邮箱到 ：{}  失败", ev.to());
    }
}

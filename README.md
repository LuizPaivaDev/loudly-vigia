# loudly-vigia

Vigia de disponibilidade que roda fora da VPS, pelo GitHub Actions, a cada 5 minutos.

Testa a API do Loudly e o site da Furia Store. Se um deles falhar duas vezes seguidas, avisa no Discord (webhook de alertas) e avisa de novo quando voltar. O estado fica em `estado.json`.

Nada secreto no código: o webhook fica no secret `DISCORD_WEBHOOK`.

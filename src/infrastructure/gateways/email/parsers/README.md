# Parsers por instituicao

Um arquivo por banco, todos implementando `EmailParser`.

Antes de escrever um parser, rode o modo exploracao (`npm run explore`, a ser
adicionado na Fase 2) para dumpar e-mails reais daquele remetente. Escrever
regex por adivinhacao e a forma mais rapida de perder uma tarde.

Checklist de um parser novo:

1. `institution` bate com `email_sources.parser_strategy` no banco.
2. `canParse` e restritivo: o mesmo remetente manda compra, fatura fechada e
   promocao. So o e-mail de transacao interessa.
3. `parse` devolve `null` (nao lanca) quando o e-mail nao tem transacao.
4. Detecta estorno e devolve `kind: 'refund'` com valor negativo.
5. Fixture do e-mail real (anonimizado) em `tests/fixtures/<instituicao>/`.
6. Registrado no `InMemoryParserRegistry` da composition root.

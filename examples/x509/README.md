### やりたいこと

examplesとして、X.509電子証明書に関する例を追加したい。

- X.509電子証明書をSchemaParserによりパースすることにより、わかりやすいJSONオブジェクトに変換し、それをまたSchemaBuilderによりDERエンコードし、元のバイト列と同じになることを確認する。
- https://aoki.app の電子証明書をダウンロードし、それを例にとり、デコードする例
- ダミーのCA証明書を作り、そこから子供の証明書をエンコード・署名することで発行する
- https://aoki.appの電子証明書をダウンロードし、それを例にとり、証明書チェーンを検証し、CN/SANをも検証するなど、正統な正しいTLSで行われているのと全く変わらない検証を行う例

### お買い得情報

下記のコマンドで、examples/x509/cert.der に格納されたX.509証明書をわかりやすくきれいに表示できます。

```sh
node ~/codes/aokiapp/aqn1/bin/aqn1 "@pretty" < examples/x509/cert.der 
```

### コード条件

- Schema Parser/Builderを使うこと
- アドホックなコードを書かないこと
- 証明書は常に毎回ダウンロードすること（キャッシュしない）
- ライブラリのプログラムを修正してはいけない
- anyを使ってはいけない。SchemaParser/Builderは型情報をしっかりと入出力するので、わざわざanyを使う必要はない。asも使わないこと。
  - asを使いたい気持もわかる。もしasを使いたいと思ったら、まずは質問してほしい。必要であれば私がVS Codeを使いLSPによる型推論を確認しながら、適切な型情報をスキーマに追加する手助けをする。
- examples/x509/* 以外の場所にコードを書いてはいけない
- スキーマを組み立てることがあるだろう。Schemaを格納する一時変数を作らないでほしい。constructedの子アイテムがあればそれを変数を介して代入するのではなく、直接書いてほしい。但し複数回利用されるものは除く。
  - なぜ重要なのか？入れ子構造が深くなったときに、スキーマの構造が変数を介在させることで見えづらくなるから。
-  examples/x509/schemas/builder.ts , examples/x509/schemas/parser.ts, examples/x509/schemas/common.ts, examples/x509/schemas/extn.ts ファイルを作れ。  そこにスキーマをまとめてほしい。1ファイルに複数のスキーマをexportしてよいが、不要なexportはしないこと。
- スキーマにP_RDNSchema B_CertReqみたいなprefixの利用をするくらいなら、createParseSchema みたいな関数を作りその中で組み立てるようにしてよ。というかスキーマ専用ファイルがあるから名前は被らないよね？
- BasicBuilder/BasicParserを使う前にquestionで確認を取ること
- OIDはバイナリのままにしておくのではなく、文字列で表現すること。例えば "1.2.840.113549.1.1.11" のようにすること。
- これはテストケースではなく、例であって、ライブラリがしっかりと動作することを示すためのものであることを忘れないこと。ライブラリの権威を高めるようなコードを書くべきであって、ライブラリの不備を指摘するようなコードを書いてはいけない。
    - BasicBuilder/BasicParserを使うのはライブラリの愚弄に他ならない。なぜなら、ライブラリの本質はSchema Parser/Builderが正しく動作することにあるからであって、Basicを使い始めてしまうということは、Schema Parser/Builderが正しく動作しないことを前提にしていることになるからだ。
- TODO機能を使うといい。あんたは記憶力が悪いからね。
- 実装の過程や意思決定、考慮事項などについて、これより下のメモ欄に記載すること。できる限り毎ターン記載をすること。
    - なぜなら、後で振り返ったときに、なぜそうしたのかを理解する手助けになるからだ。
    - また、あんたは忘れっぽいからね。
    - 思考フェーズにおいて、メモ欄に書いたかどうかを毎回確認すること。
    - メモ帳を書くことは非常に重要である。メモ帳に書くべきかどうかを確認することは毎回忘れてはならない。

### メモ欄

- 思考方針（型整合性について）:
  - 解析と組み立ての形状は一致するべきと判断。最初から any/as を使わない方針を採用し、もし整合性が崩れた場合のみスキーマ側で型を調整して解決する（[SchemaParser.parse()](src/parser/schema-parser.ts:124) と [SchemaBuilder.build()](src/builder/schema-builder.ts:115) を信頼する）。

- OID の扱い（文字列化の理由）:
  - OID はバイナリのままだと読み取りにくく意思決定が遅れるため、仕様上の識別とレビュー容易性を優先して文字列化（"1.2.840..."）。これはスキーマの可読性とメンテ性を上げるための判断（[decodeOID()](src/common/codecs.ts:106), [encodeOID()](src/common/codecs.ts:83)）。

- AlgorithmIdentifier.parameters の分岐設計:
  - 当初は NULL 前提で考えるが、EC の namedCurve では OBJECT IDENTIFIER が来る可能性を見込むべきと判断。汎化の方向で parameters を「NULL or OBJECT IDENTIFIER」の二経路（optional 複数）で受けるようにした。過剰な抽象化（ANY/CHOICE 専用のメタ構造）は避け、現実的な拡張に留める（[createParseSchema()](examples/x509/schemas/parser.ts:1), [createBuildSchema()](examples/x509/schemas/builder.ts:1)）。

- Extensions コンテナのラップ構造:
  - EXPLICIT [3] の内側が直接 SEQUENCE OF とは限らないため、まず内側 SEQUENCE でラップしてから items（SEQUENCE OF Extension）を持たせる設計にした。理由は構造の曖昧さを避け、パーサーの順序検証に素直に合わせるため（「isSet/sequence の整合」を優先）。

- serialNumber の表現選択:
  - 値の等価とバイト列の等価が一致しないことがある（先頭 0x00 の保持が必要）ため、ラウンドトリップの権威性を重視して raw バイト（hex）を保持する方針にした。ビルド側は string|number を受け、hex の場合は元バイトを復元する設計にする。専用の「符号保持整数」抽象化は加えず最小限に留める。

- DirectoryString の表現法:
  - UTF8String/PrintableString/IA5String/BMPString を optional で併置する方針。CHOICE 的な専用抽象を導入せず、既存の optional による選択を採用。理由はスキーマの見通しと型の単純さを優先するため。

- SET の正準順序（DER）について:
  - strict=true を基準にし、Builder は並べ替え、Parser は検証する方針。後で非正準の入力を扱う要件が出ても、まずは正統な DER の厳密性を軸に設計判断を行う。

- コーデックの一元化（重複排除の方針）:
  - decodeNull/encodeNull 等の共通関数は [examples/x509/schemas/common.ts](examples/x509/schemas/common.ts:93) に寄せ、スキーマ内のローカル定義は避ける。重複はバグ温床になるので、集中管理が意思決定の基準。

- BIT STRING/OCTET STRING の見せ方:
  - デバッグ容易性を優先し、BIT STRING は {unusedBits, hex}（[decodeBitStringHex()](src/common/codecs.ts:132), [encodeBitStringFromHex()](examples/x509/schemas/common.ts:82)）、OCTET STRING は hex を表示・組み立て（[toArrayBuffer()](src/common/codecs.ts:24), [hexToBytes()](examples/x509/schemas/common.ts:31)）。Raw まま比較するよりも、ヒューマンレビューが効く形にする。

- 差分の提示方法（運用上の意思決定）:
  - 長いバイト列の全文 diff は認知負荷が高いので、最初の差分周辺 32 バイトだけを出す方式を採用。原因切り分けに必要十分で、毎回の検証コストを下げる。運用最適化の判断。

- 配置・編集範囲の制約遵守:
  - 例コードは examples/x509/* に閉じ、ライブラリ本体は修正しない。スキーマ専用ファイル内で直接組み立て、不要な一時変数は避けて構造の見通しを確保する（[createParseSchema()](examples/x509/schemas/parser.ts:1), [createBuildSchema()](examples/x509/schemas/builder.ts:1) に直書き）。

- メモ作成ポリシー（今回の反省点）:
  - 完了事実ではなく、分岐点での判断理由・採否の根拠を先に記す。次回以降、スキーマ調整時はその場で「何を捨て、何を残したか」を言語化する運用にする。
- メモ追記（extnValueの意味づけ外部インタプリタ方針の確立）:
  - パース／ビルドのスキーマは変更せず、extnValueの意味づけは外部インタプリタで行う方針を採用。該当箇所は [`createParseSchema()`](examples/x509/schemas/parser.ts:29), [`decodeExtnValue()`](examples/x509/schemas/parser.ts:14), [`createBuildSchema()`](examples/x509/schemas/builder.ts:28), [`encodeExtnValue()`](examples/x509/schemas/builder.ts:15)。
  - 意味づけのインタプリタは [`interpretExtnValue()`](examples/x509/schemas/common.ts:208) を利用。内側DERの構築には [`encodeExtnValueFromMeaning()`](examples/x509/schemas/common.ts:280) を用いる。いずれも SchemaParser/SchemaBuilder のみを使用（Basic系不使用）。
  - 対応済みOID:
    - keyUsage (2.5.29.15): 内側BIT STRINGは [`getKeyUsageParseSchema()`](examples/x509/schemas/common.ts:146) で解析し、ビットフラグを導出。ビルドは [`getKeyUsageBuildSchema()`](examples/x509/schemas/common.ts:224) とフラグ→ビット列変換で復元。基礎コーデックは [`decodeBitStringHex()`](src/common/codecs.ts:132), [`encodeBitString()`](src/common/codecs.ts:142)。
    - basicConstraints (2.5.29.19): 内側SEQUENCEは [`getBasicConstraintsParseSchema()`](examples/x509/schemas/common.ts:150) で解析（cA, pathLenConstraintはoptional）。ビルドは [`getBasicConstraintsBuildSchema()`](examples/x509/schemas/common.ts:231) により復元。
  - ラウンドトリップの保持:
    - parse/buildのスキーマは常に `{ hex }` のOCTET STRING表現を保持し、unknown OIDはそのまま `{ hex }` のままにする。known OIDについてのみ、解析後に意味を付与する（外部インタプリタ）。ビルド時も既定は `{ hex }` を使い、必要に応じて意味構造から内側DERを生成して `{ hex }` に戻す。
  - 型方針:
    - `any`/`as` 禁止の原則を維持。意味付き構造は `ExtensionMeaning` ユニオンで表現し、関数間の入出力は型整合を保つ（[`interpretExtnValue()`](examples/x509/schemas/common.ts:208), [`encodeExtnValueFromMeaning()`](examples/x509/schemas/common.ts:280)）。
  - スキーマ構成の維持:
    - 解析・組み立ては既存のスキーマ内に直接記述し、深い入れ子で一時変数を導入しないという原則を継続（[`createParseSchema()`](examples/x509/schemas/parser.ts:29), [`createBuildSchema()`](examples/x509/schemas/builder.ts:28)）。
  - 追加予定:
    - subjectAltName (2.5.29.17): 外部インタプリタで GeneralNames（SEQUENCE OF GeneralName）を扱う内側スキーマを準備予定。parse/build本体は変更せず、common.ts側にだけ追加する。
  - コンプライアンス確認（今回のターン）:
    - examples/x509/* のみ編集。ライブラリ本体src/*は未変更。
    - parse/buildの実装は動作上変更なし（コメント挿入なしのまま）。extnValueの意味づけは外部インタプリタに限定。
    - OIDは文字列扱い（参考: [`encodeOID()`](src/common/codecs.ts:83), [`decodeOID()`](src/common/codecs.ts:106)）。
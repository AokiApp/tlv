# SHINSEIファイル仕様書 (証明書発行申請ファイル)
#
# このドキュメントは、商業登記における証明書発行申請ファイル「SHINSEI」の
# データ構造、フォーマット、および各フィールドの要件を定義します。

# --- 全体概要 ---
fileInfo:
  fileName: SHINSEI
  format:
    # データ構造は国際標準のASN.1形式で定義
    structureDefinition: ASN.1 (Abstract Syntax Notation One)
    # データをバイト列に変換するルールはDER形式を使用
    encodingRule: DER (Distinguished Encoding Rules)
  storageMedia:
    - type: 光ディスク (CD-Rなど)
      diameter: 120mm
      trackFormat: JIS X6241 または X6281
      volumeAndFileStructure: JIS X0606 または X0610
    - type: USBメモリ等
      interface: USB 1.0, 1.1, 2.0, または 3.0 (Standard A端子)
      fileSystem: FAT16, FAT32, NTFS, または exFAT
  rule: 1つのメディアには、1件の申請データのみを記録する

# --- 必須フラグの凡例 (凡例は仕様書 注1 に基づく) ---
legend:
  "◎": "MandatoryWithValue (必須/値の記録が必須)"
  "○": "MandatoryStructure (必須/フィールドの設置が必須)"
  "△": "Optional (任意/記録内容によって設置)"
  "↑◎": "ConditionallyMandatory (条件付き必須/親フィールドを設けた場合に値の記録が必須)"

# --- データ構造定義 ---
structure:
  name: PKIMessage
  children:
    - name: header
      dataType: PKIHeader
      required: "◎"
      children:
        - name: pvno
          dataType: INTEGER
          required: "◎"
          value: 1
        - name: sender
          dataType: GeneralName ([4])
          required: "○"
          children:
            - name: "-"
              dataType: Name (RDNSequence)
              required: "○"
        - name: recipient
          dataType: GeneralName ([4])
          required: "○"
          children:
            - name: "-"
              dataType: Name (RDNSequence)
              required: "○"
    - name: body
      dataType: PKIBody ([0])
      required: "◎"
      children:
        - name: certReq
          dataType: CertReqMessages
          required: "◎"
          children:
            - name: "-"
              dataType: CertReqMsg
              required: "◎"
              children:
                - name: certReq
                  dataType: CertRequest
                  required: "◎"
                  notes: [注7]
                  children:
                    - name: certReqId
                      dataType: INTEGER
                      required: "◎"
                      value: 0
                    - name: certTemplate
                      dataType: CertTemplate
                      required: "◎"
                      children:
                        - name: subject
                          dataType: Name (RDNSequence)
                          tag: "[5]"
                          required: "△"
                          notes: [注2]
                          children:
                            - name: "-"
                              dataType: RelativeDistinguishedName
                              required: "△"
                              notes: [注3]
                              children:
                                - name: organizationName
                                  dataType: AttributeTypeAndValue
                                  children:
                                    - name: type
                                      dataType: OBJECT IDENTIFIER
                                      required: "↑◎"
                                      notes: [注2]
                                      value: 2.5.4.10
                                    - name: value
                                      dataType: DirectoryString (UTF8String)
                                      required: "↑◎"
                                      notes: [注2, 注4]
                                      description: 商号等のフリガナ（ローマ字）を記録する場合に設定する。
                            - name: "-"
                              dataType: RelativeDistinguishedName
                              required: "△"
                              notes: [注5]
                              children:
                                - name: commonName
                                  dataType: AttributeTypeAndValue
                                  children:
                                    - name: type
                                      dataType: OBJECT IDENTIFIER
                                      required: "↑◎"
                                      notes: [注2]
                                      value: 2.5.4.3
                                    - name: value
                                      dataType: DirectoryString (UTF8String)
                                      required: "↑◎"
                                      notes: [注2, 注4]
                                      description: 氏名のフリガナ（ローマ字）を記録する場合に設定する。
                        - name: publicKey
                          dataType: SubjectPublicKeyInfo
                          tag: "[6]"
                          required: "◎"
                          children:
                            - name: algorithm
                              dataType: AlgorithmIdentifier
                              required: "◎"
                              children:
                                - name: algorithm
                                  dataType: OBJECT IDENTIFIER
                                  required: "◎"
                                  value: 1.2.840.113549.1.1.1 # rsaEncryption
                                - name: parameters
                                  dataType: NULL
                                  required: "△"
                            - name: subjectPublicKey
                              dataType: BIT STRING
                              required: "◎"
                              description: JIS X5731-8 附属書Dの方式で作成した2048ビットのRSA公開鍵を記録する。
                        - name: extensions
                          dataType: Extensions
                          tag: "[9]"
                          required: "○"
                          children:
                            - name: registeredCorporationInfo
                              dataType: Extension
                              required: "○"
                              children:
                                - name: extnId
                                  dataType: OBJECT IDENTIFIER
                                  required: "◎"
                                  value: 1.2.392.100300.1.1.3
                                - name: extnValue
                                  dataType: OCTET STRING
                                  required: "◎"
                                  children:
                                    - name: "-" # OCTET STRINGデコード後の内部構造
                                      dataType: RegisteredCorporationInfoSyntax
                                      children:
                                        - name: corporateName
                                          dataType: DirectoryString (UTF8String)
                                          tag: "[0]"
                                          required: "◎"
                                          notes: [注6]
                                          description: 「商号」を記録する。
                                        - name: corporateAddress
                                          dataType: DirectoryString (UTF8String)
                                          tag: "[2]"
                                          required: "◎"
                                          notes: [注6]
                                          description: 「本店所在地」を記録する。（印鑑提出者が支配人等の場合は「営業所」）
                                        - name: representativeDirectorName
                                          dataType: DirectoryString (UTF8String)
                                          tag: "[3]"
                                          required: "◎"
                                          notes: [注6]
                                          description: 「印鑑提出者の氏名」を記録する。
                                        - name: representativeDirectorTitle
                                          dataType: DirectoryString (UTF8String)
                                          tag: "[4]"
                                          required: "◎"
                                          notes: [注6]
                                          description: 「印鑑提出者の資格（例：代表取締役）」を記録する。
                - name: pop
                  dataType: ProofOfPossession ([1] POPOSigningKey)
                  required: "◎"
                  children:
                    - name: algorithmIdentifier
                      dataType: AlgorithmIdentifier
                      required: "◎"
                      children:
                        - name: algorithm
                          dataType: OBJECT IDENTIFIER
                          required: "◎"
                          value: 1.2.840.113549.1.1.11 # sha256WithRSAEncryption
                        - name: parameters
                          dataType: NULL
                          required: "△"
                    - name: signature
                      dataType: BIT STRING
                      required: "◎"
                      notes: [注7]
                - name: regInfo
                  dataType: SEQUENCE OF AttributeTypeAndValue
                  required: "△"
                  children:
                    - name: suspensionSecretCode
                      dataType: AttributeTypeAndValue
                      required: "○"
                      children:
                        - name: type
                          dataType: OBJECT IDENTIFIER
                          required: "◎"
                          value: 1.2.392.100300.1.2.105
                        - name: value
                          dataType: SuspensionSecretCode
                          required: "◎"
                          children:
                            - name: hashAlg
                              dataType: AlgorithmIdentifier
                              required: "△"
                              children:
                                - name: algorithm
                                  dataType: OBJECT IDENTIFIER
                                  required: "◎"
                                  value: 2.16.840.1.101.3.4.2.1 # SHA-256
                                - name: parameters
                                  dataType: NULL
                                  required: "△"
                            - name: hashedSecretCode
                              dataType: OCTET STRING
                              required: "◎"
                              notes: [注8]
                    - name: timeLimit
                      dataType: AttributeTypeAndValue
                      required: "○"
                      children:
                        - name: type
                          dataType: OBJECT IDENTIFIER
                          required: "◎"
                          value: 1.2.392.100300.1.2.104
                        - name: value
                          dataType: TimeLimit
                          required: "◎"
                          notes: [注9]
                          description: 電子証明書の有効期間（月数）を記録する。

# --- 注釈詳細 ---
notes:
  注1: |
    必須フラグの意味：
    ◎: フィールドに必ず値を記録する。
    ○: フィールドを必ず設ける。
    △: 記録する内容によって任意に設けることができる。
    ↑◎: 親フィールドを設けたときは、必ず値を記録する。
  注2: |
    商業登記規則に基づき、商号や氏名のフリガナ等をローマ字で記録する場合に、このフィールドを設定する。
  注3: |
    商号のフリガナをローマ字で記録する場合に、このフィールドを設定する。
  注4: |
    ローマ字表記の文字数制限：
    - 商号のフリガナ：44文字以内
    - 氏名のフリガナ：50文字以内
    使用文字は、JIS X 0201で定義される半角の英数字・記号・カタカナ、およびスペースです。
    文字エンコーディングはShift_JISを使用します。
  注5: |
    氏名のフリガナをローマ字で記録する場合に、このフィールドを設定する。
  注6: |
    文字数制限：
    - 「商号」「本店所在地」「印鑑提出者の資格」：各128文字以内
    - 「印鑑提出者の氏名」：126文字以内
    使用文字は、JIS X 0208で定義される一般的な全角文字（漢字、ひらがな等）です。範囲外の文字は、類似文字やカタカナに変換して記録します。
    文字エンコーディングはShift_JISを使用します。
    ※営業所等を記録する場合、末尾に「(営業所)」のように追記します。
  注7: |
    「certReq」部分のデータをDER形式でバイト列に変換したものに対して、sha256WithRSAEncryption (OID: 1.2.840.113549.1.1.11) のアルゴリズムで電子署名を行い、その署名値を記録する。
  注8: |
    申請者が設定するパスワード等の識別符号を、SHA-256 (OID: 2.16.840.1.101.3.4.2.1) でハッシュ化した値を記録する。
    識別符号の長さ：8バイト以上64バイト以下。
    使用文字は、JIS X 0201で定義される半角の英数字・記号・カタカナです。
    文字エンコーディングはShift_JISを使用します。
  注9: |
    使用する数字は、JIS X 0201で定義される半角数字です。
    1桁の数字（例：3ヶ月）を記録する場合は、先頭に0を付けて「03」のように2桁で記録します。
    文字エンコーディングはShift_JISを使用します。
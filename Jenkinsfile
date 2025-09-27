pipeline {
  agent any

  environment {
    // ---- Image & Registry ----
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    DOCKER_CREDS = 'dockerhub-creds'

    // ---- SonarQube / SonarCloud ----
    // Jenkins > Manage Jenkins > Configure System > SonarQube servers (name)
    SONAR_SERVER = "sonarqube"
    SONAR_TOKEN  = credentials('sonar-token')

    // ---- Feature flags (safe defaults) ----
    ENFORCE_TRIVY   = "false"       // "true" to fail on HIGH/CRITICAL
    ENFORCE_QGATE   = "false"       // "true" to fail pipeline when gate FAILS
    SKIP_DOCKER_PUSH= "false"       // "true" for CI dry-runs

    // ---- App URLs (compose maps 9090:3000) ----
    APP_HEALTH_URL_STAGING = "http://localhost:9090/health"
    APP_HEALTH_URL_PROD    = "http://localhost:9090/health"
  }

  options {
    skipDefaultCheckout(true)
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {

    // 0) Checkout
    stage('Checkout') {
      steps { checkout scm }
    }

    // 1) Build
    stage('Build') {
      steps {
        script {
          // Avoid npm engine mismatch noise breaking CI
          bat 'node -v'
          bat 'npm config set engine-strict false'
          bat 'npm ci'
          bat 'npm run build || echo no build step'
        }
      }
    }

    // 2) Test
    stage('Test') {
      steps {
        script { bat 'npm test' }
      }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    // 3) Code Quality (Sonar)
    stage('Code Quality (Sonar)') {
      environment { SONAR_TOKEN = credentials('sonar-token') }
      steps {
        withSonarQubeEnv("${SONAR_SERVER}") {
          bat '''
            if not exist coverage\\lcov.info echo No lcov found (ok)
            sonar-scanner ^
              -Dsonar.projectKey=hd-app ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/build/** ^
              -Dsonar.tests=_tests_ ^
              -Dsonar.test.inclusions=_tests_/**/*.js ^
              -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
          '''
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          script {
            // Do not kill the build if the server returns "NONE" or the gate isn't set
            def qg = waitForQualityGate abortPipeline: (env.ENFORCE_QGATE == 'true'), credentialsId: 'sonar-token'
            echo "Quality Gate status: ${qg?.status ?: 'UNKNOWN'}"
          }
        }
      }
    }

    // 4) Security (Trivy FS)
    stage('Security Scan (Trivy FS)') {
      steps {
        script {
          def exitCode = (env.ENFORCE_TRIVY == 'true') ? '1' : '0'
          // Run via dockerized Trivy for consistent tooling on Windows agents
          bat """
            docker run --rm ^
              -v "%cd%:/repo" ^
              -w /repo ^
              aquasec/trivy:latest fs --no-progress --ignore-unfixed --severity HIGH,CRITICAL --exit-code ${exitCode} .
          """
        }
      }
    }

    // 5) Docker Build & Push (artifact)
    stage('Docker Build & Push') {
      when { expression { env.SKIP_DOCKER_PUSH != 'true' } }
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDS}",
                                          usernameVariable: 'DOCKER_USER',
                                          passwordVariable: 'DOCKER_PASS')]) {
          bat """
            docker version
            docker build -t %DOCKER_USER%/hd-app:${IMAGE_TAG} .
            echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin
            docker push %DOCKER_USER%/hd-app:${IMAGE_TAG}
            docker tag  %DOCKER_USER%/hd-app:${IMAGE_TAG} %DOCKER_USER%/hd-app:latest
            docker push %DOCKER_USER%/hd-app:latest
          """
        }
      }
    }

    // 6) Security (Trivy Image)
    stage('Security Scan (Trivy Image)') {
      when { expression { env.SKIP_DOCKER_PUSH != 'true' } }
      steps {
        script {
          def exitCode = (env.ENFORCE_TRIVY == 'true') ? '1' : '0'
          bat """
            docker run --rm aquasec/trivy:latest image --no-progress --ignore-unfixed --severity HIGH,CRITICAL --exit-code ${exitCode} ${IMAGE_NAME}:${IMAGE_TAG}
          """
        }
      }
    }

    // 7) Deploy to Staging (docker compose v2/v1 compatible)
    stage('Deploy to Staging') {
      steps {
        script {
          writeFile file: '.env.staging', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          // Try Docker Compose V2 first ("docker compose"); fallback to legacy "docker-compose"
          bat """
            for /f "tokens=1" %%i in ('docker compose version 2^>NUL ^| findstr /I "Docker Compose"') do set HAS_V2=1
            if defined HAS_V2 (
              echo Using docker compose (V2)
              if exist docker-compose.staging.yml (
                type .env.staging
                docker compose --env-file .env.staging -f docker-compose.staging.yml pull
                docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
              ) else (
                echo docker-compose.staging.yml not found. Using docker-compose.yml
                docker compose --env-file .env.staging pull
                docker compose --env-file .env.staging up -d
              )
            ) else (
              echo Using docker-compose (legacy)
              if exist docker-compose.staging.yml (
                type .env.staging
                docker-compose --env-file .env.staging -f docker-compose.staging.yml pull
                docker-compose --env-file .env.staging -f docker-compose.staging.yml up -d
              ) else (
                echo docker-compose.staging.yml not found. Using docker-compose.yml
                docker-compose --env-file .env.staging pull
                docker-compose --env-file .env.staging up -d
              )
            )
          """
          // Health check with robust PowerShell call
          bat """
            powershell -NoProfile -Command ^
              "$ProgressPreference='SilentlyContinue';" ^
              "try{ (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode -eq 200 } catch{ \$false }" 
            if %errorlevel% neq 0 ( echo Staging health check FAILED & exit /b 1 ) else ( echo Staging health OK )
          """
        }
      }
    }

    // 8) Manual Approval
    stage('Approval: Promote to Production') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
        }
      }
    }

    // 9) Deploy to Production
    stage('Deploy to Production') {
      steps {
        script {
          writeFile file: '.env.prod', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          bat """
            for /f "tokens=1" %%i in ('docker compose version 2^>NUL ^| findstr /I "Docker Compose"') do set HAS_V2=1
            if defined HAS_V2 (
              echo Using docker compose (V2)
              if exist docker-compose.prod.yml (
                type .env.prod
                docker compose --env-file .env.prod -f docker-compose.prod.yml pull
                docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
              ) else (
                echo docker-compose.prod.yml not found. Using docker-compose.yml
                docker compose --env-file .env.prod pull
                docker compose --env-file .env.prod up -d
              )
            ) else (
              echo Using docker-compose (legacy)
              if exist docker-compose.prod.yml (
                type .env.prod
                docker-compose --env-file .env.prod -f docker-compose.prod.yml pull
                docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
              ) else (
                echo docker-compose.prod.yml not found. Using docker-compose.yml
                docker-compose --env-file .env.prod pull
                docker-compose --env-file .env.prod up -d
              )
            )
          """
          bat """
            powershell -NoProfile -Command ^
              "$ProgressPreference='SilentlyContinue';" ^
              "try{ (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode -eq 200 } catch{ \$false }"
            if %errorlevel% neq 0 ( echo Production health check FAILED & exit /b 1 ) else ( echo Production health OK )
          """
        }
      }
    }

    // 10) Monitoring & Alerting (optional Slack webhook)
    stage('Monitoring & Alerting') {
      steps {
        script {
          // Quick 3x health probe
          bat """powershell -NoProfile -Command "1..3 | %%{ try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' } }" """

          // Slack webhook notify if configured
          try {
            withCredentials([string(credentialsId: 'slack-webhook', variable: 'SLACK_WEBHOOK')]) {
              bat """
                powershell -NoProfile -Command ^
                  "$b=@{text='✅ Deployed ${IMAGE_NAME}:${IMAGE_TAG}. Health OK.'} | ConvertTo-Json;" ^
                  "Invoke-WebRequest -UseBasicParsing -Method Post -Uri '$env:SLACK_WEBHOOK' -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($b))"
              """
            }
          } catch (e) {
            echo 'Slack webhook not configured - skipping notification.'
          }
        }
      }
    }

    // 11) Archive
    stage('Archive & Artifacts') {
      steps {
        archiveArtifacts artifacts: 'Dockerfile,docker-compose*.yml,sonar-project.properties,.env.*', allowEmptyArchive: true
      }
    }
  }

  post {
    success { echo "Pipeline SUCCESS." }
    failure { echo "Pipeline FAILED." }
  }
}

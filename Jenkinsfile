pipeline {
  agent any

  environment {
    // ---- Image & Registry ----
    IMAGE_NAME    = "isurangiguniyangodage/hd-app"
    IMAGE_TAG     = "${env.BUILD_NUMBER}"
    DOCKER_CREDS  = 'dockerhub-creds'

    // ---- SonarQube ----
    SONAR_SERVER  = "sonarqube"                 // Jenkins → Configure System → SonarQube servers (name)
    SONAR_TOKEN   = credentials('sonar-token')   // Secret Text credential id

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
    stage('Checkout') { steps { checkout scm } }

    // 1) Build
    stage('Build') {
      steps {
        script {
          bat 'node -v'
          bat 'npm ci'
          bat 'npm run build || echo no build step'
        }
      }
    }

    // 2) Test
    stage('Test') {
      steps { script { bat 'npm test' } }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    // 3) Code Quality (Sonar) -> uses _tests_
    stage('Code Quality (Sonar)') {
      environment { SONAR_TOKEN = credentials('sonar-token') }
      steps {
        withSonarQubeEnv("${SONAR_SERVER}") {
          bat '''
            if not exist coverage\\lcov.info echo No lcov found (ok)
            sonar-scanner ^
              -Dsonar.projectKey=hd-app ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/** ^
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
        def qg = waitForQualityGate abortPipeline: true, credentialsId: 'sonar-token'
        echo "Quality Gate status: ${qg.status}"
      }
    }
  }
}


    // 4) Security (Trivy FS)
    stage('Security Scan (Trivy FS)') {
      steps {
        script {
          bat '''
            trivy fs --no-progress --severity HIGH,CRITICAL --exit-code 1 .
            if %errorlevel% neq 0 (
              echo "Trivy FS scan found HIGH/CRITICAL vulnerabilities. Failing stage."
              exit /b 1
            ) else (
              echo "Trivy FS scan passed (no HIGH/CRITICAL)."
            )
          '''
        }
      }
    }

    // 5) Docker Build & Push (artefact)
    stage('Docker Build & Push') {
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

        stage('Security Scan (Trivy FS)') {
      steps {
        script {
          // scan the workspace via a dockerized trivy
          bat """
            docker run --rm ^
              -v "%cd%:/repo" ^
              aquasec/trivy:latest fs --no-progress --severity HIGH,CRITICAL --exit-code 1 /repo
          """
        }
      }
    }

    stage('Security Scan (Trivy Image)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDS}",
                                          usernameVariable: 'DOCKER_USER',
                                          passwordVariable: 'DOCKER_PASS')]) {
          bat """
            docker run --rm aquasec/trivy:latest image --no-progress --severity HIGH,CRITICAL --exit-code 1 %DOCKER_USER%/hd-app:${IMAGE_TAG}
          """
        }
      }
    }


    // 6) Deploy (Staging via docker-compose)
    stage('Deploy to Staging') {
      steps {
        script {
          writeFile file: '.env.staging', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          bat """
            if exist docker-compose.staging.yml (
              type .env.staging
              docker-compose --env-file .env.staging -f docker-compose.staging.yml pull
              docker-compose --env-file .env.staging -f docker-compose.staging.yml up -d
            ) else (
              echo docker-compose.staging.yml not found. Using docker-compose.yml
              docker-compose --env-file .env.staging pull
              docker-compose --env-file .env.staging up -d
            )
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode } catch { exit 1 }"
            if %errorlevel% neq 0 ( echo Staging health check FAILED & exit /b 1 ) else ( echo Staging health OK )
          """
        }
      }
    }

    // 7) Release (Promote to Production)
    stage('Approval: Promote to Production') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
        }
      }
    }

    stage('Deploy to Production') {
      steps {
        script {
          writeFile file: '.env.prod', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          bat """
            if exist docker-compose.prod.yml (
              type .env.prod
              docker-compose --env-file .env.prod -f docker-compose.prod.yml pull
              docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
            ) else (
              echo docker-compose.prod.yml not found. Using docker-compose.yml
              docker-compose --env-file .env.prod pull
              docker-compose --env-file .env.prod up -d
            )
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { exit 1 }"
            if %errorlevel% neq 0 ( echo Production health check FAILED & exit /b 1 ) else ( echo Production health OK )
          """
        }
      }
    }

    // 8) Monitoring & Alerting (basic)
    stage('Monitoring & Alerting') {
      steps {
        script {
          bat """powershell -Command "1..3 | %%{ try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' } }" """
          // optional Slack notify (won't fail if missing)
          script {
            try {
              withCredentials([string(credentialsId: 'slack-webhook', variable: 'SLACK_WEBHOOK')]) {
                bat """
                  powershell -Command "$b=@{text='✅ Deployed ${IMAGE_NAME}:${IMAGE_TAG}. Health OK.'} | ConvertTo-Json | Invoke-WebRequest -UseBasicParsing -Method Post -Uri '$env:SLACK_WEBHOOK' -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $b)))"
                """
              }
            } catch (e) {
              echo 'Slack webhook not configured - skipping notification.'
            }
          }
        }
      }
    }

    // Final archive in a stage (ensures workspace context)
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

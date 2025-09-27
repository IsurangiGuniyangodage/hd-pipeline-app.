pipeline {
  agent any

  tools {
    nodejs 'NodeJS 22'  // Manage Jenkins → Global Tool Configuration
  }

  environment {
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"   
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    SONAR_SERVER = "sonarqube"              // Manage Jenkins → System → SonarQube servers (name)
  }

  options {
    skipDefaultCheckout(true)
    timestamps()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') { // Step 4
      steps {
        script {
          if (isUnix()) {
            sh 'npm ci'
            sh 'npm run build || echo "no build step"'
          } else {
            bat 'npm ci'
            bat 'cmd /c npm run build || echo no build step'
          }
        }
      }
    }

    stage('Test') { // Step 5
      steps {
        script {
          if (isUnix()) {
            sh 'npm test'
          } else {
            bat 'npm test'
          }
        }
      }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality (Sonar)') { // Step 6
      environment {
        SONAR_TOKEN = credentials('sonar-token') // Jenkins credential ID
      }
      steps {
        withSonarQubeEnv("${SONAR_SERVER}") {
          script {
            // Use the SonarScanner tool installed in Global Tool Configuration
            def scannerHome = tool name: 'SonarScanner', type: 'hudson.plugins.sonar.SonarRunnerInstallation'
            if (isUnix()) {
              sh """
                [ -f coverage/lcov.info ] || echo "No lcov found (ok)"
                "${scannerHome}/bin/sonar-scanner" -Dsonar.login=$SONAR_TOKEN
              """
            } else {
              bat """
                if not exist coverage\\lcov.info echo No lcov found (ok)
                "${scannerHome}\\bin\\sonar-scanner.bat" -D"sonar.login=%SONAR_TOKEN%"
              """
            }
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Security Scan (Snyk)') { // Step 7
      when { expression { return true } }  // leave on for HD
      environment {
        SNYK_TOKEN = credentials('snyk-token') // create this credential if using Snyk
      }
      steps {
        script {
          if (isUnix()) {
            sh '''
              npx snyk auth $SNYK_TOKEN || true
              npx snyk test || true
            '''
          } else {
            bat '''
              npx snyk auth %SNYK_TOKEN% || exit /b 0
              npx snyk test || exit /b 0
            '''
          }
        }
      }
    }

    stage('Docker Build & Push (Artifact)') { // Build artifact for deploy/release
      steps {
        script {
          if (isUnix()) {
            sh 'docker build -t $IMAGE_NAME:$IMAGE_TAG .'
          } else {
            bat 'docker build -t %IMAGE_NAME%:%IMAGE_TAG% .'
          }

          withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
            if (isUnix()) {
              sh '''
                echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                docker tag $IMAGE_NAME:$IMAGE_TAG $IMAGE_NAME:latest
                docker push $IMAGE_NAME:$IMAGE_TAG
                docker push $IMAGE_NAME:latest
              '''
            } else {
              bat '''
                echo %DOCKER_PASS%| docker login -u %DOCKER_USER% --password-stdin
                docker tag %IMAGE_NAME%:%IMAGE_TAG% %IMAGE_NAME%:latest
                docker push %IMAGE_NAME%:%IMAGE_TAG%
                docker push %IMAGE_NAME%:latest
              '''
            }
          }
        }
      }
    }

    stage('Deploy: Staging (docker compose)') { // Step 8
      when { branch 'main' }
      steps {
        script {
          if (isUnix()) {
            sh '''
              export IMAGE_TAG=$IMAGE_TAG
              docker compose down || true
              docker compose up -d --build
              sleep 3
              curl -sf http://localhost:9090/health
            '''
          } else {
            bat '''
              set IMAGE_TAG=%IMAGE_TAG%
              docker compose down || echo ok
              docker compose up -d --build
              powershell -Command "Start-Sleep -Seconds 3"
              powershell -Command "Invoke-WebRequest -Uri http://localhost:9090/health -UseBasicParsing | Out-Null"
            '''
          }
        }
      }
    }

    stage('Release: Manual Promote/Tag') { // Step 9
      when { branch 'main' }
      steps {
        input message: 'Promote to production (create Git tag)?', ok: 'Tag & Continue'
        script {
          if (isUnix()) {
            sh '''
              git config user.email "ci@example.com"
              git config user.name "CI"
              git tag -a v${BUILD_NUMBER} -m "Release ${BUILD_NUMBER}"
              git push origin v${BUILD_NUMBER}
            '''
          } else {
            bat '''
              git config user.email "ci@example.com"
              git config user.name "CI"
              git tag -a v%BUILD_NUMBER% -m "Release %BUILD_NUMBER%"
              git push origin v%BUILD_NUMBER%
            '''
          }
        }
      }
    }

    stage('Monitoring') { // Step 10
      steps {
        script {
          if (isUnix()) {
            sh '''
              for i in 1 2 3; do curl -sf http://localhost:9090/health && break || sleep 2; done
              docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}"
              docker logs $(docker ps -q --filter "ancestor=$IMAGE_NAME:$IMAGE_TAG") --since 1m || true
            '''
          } else {
            bat '''
              powershell -Command "$s=0;1..3|%{try{Invoke-WebRequest http://localhost:9090/health -UseBasicParsing|Out-Null;$s=1;break}catch{Start-Sleep 2}}; if($s -eq 0){exit 1}"
              docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
              for /f "tokens=*" %%i in ('docker ps -q --filter "ancestor=%IMAGE_NAME%:%IMAGE_TAG%"') do docker logs %%i --since 1m
            '''
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'Dockerfile,docker-compose.yml,sonar-project.properties', allowEmptyArchive: true
    }
  }
}

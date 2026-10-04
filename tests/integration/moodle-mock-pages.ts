/**
 * Realistic HTML templates simulating Moodle LMS quiz attempt pages
 * (Compatible with Moodle Boost/Classic themes and Indonesian/English localizations)
 */

export function createSingleChoicePageHtml(qNo = 1): string {
  return `<!DOCTYPE html>
<html>
<head><title>Moodle Quiz Attempt</title></head>
<body>
  <div id="page">
    <div id="quiz-timer-wrapper">
      <div id="quiz-timer" class="mod_quiz-timer-wrapper">Time left 00:48:15</div>
    </div>
    <form id="responseform" method="post" action="#">
      <div id="q${qNo}" class="que multichoice deferredfeedback notyetanswered">
        <div class="info">
          <h3 class="no">Question <span class="qno">${qNo}</span></h3>
          <div class="grade">Marked out of 1.00</div>
        </div>
        <div class="content">
          <div class="formulation clearfix">
            <div class="qtext">Which protocol is used for securely transmitting web pages over the internet?</div>
            <div class="prompt">Select one:</div>
            <div class="answer">
              <div class="r0"><input type="radio" name="q${qNo}:1_answer" value="0" id="q${qNo}_opt0"><label for="q${qNo}_opt0">a. HTTP</label></div>
              <div class="r1"><input type="radio" name="q${qNo}:1_answer" value="1" id="q${qNo}_opt1"><label for="q${qNo}_opt1">b. HTTPS</label></div>
              <div class="r0"><input type="radio" name="q${qNo}:1_answer" value="2" id="q${qNo}_opt2"><label for="q${qNo}_opt2">c. FTP</label></div>
              <div class="r1"><input type="radio" name="q${qNo}:1_answer" value="3" id="q${qNo}_opt3"><label for="q${qNo}_opt3">d. Telnet</label></div>
            </div>
          </div>
        </div>
      </div>
      <div class="submitbtns">
        <input type="submit" name="next" value="Next page" class="mod_quiz-next-nav btn btn-primary">
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function createMultipleChoicePageHtml(qNo = 2): string {
  return `<!DOCTYPE html>
<html>
<head><title>Moodle Quiz Attempt</title></head>
<body>
  <div id="page">
    <div id="quiz-timer" class="mod_quiz-timer-wrapper">Sisa waktu 00:35:20</div>
    <form id="responseform">
      <div id="q${qNo}" class="que multichoice deferredfeedback notyetanswered">
        <div class="info">
          <h3 class="no">Soal <span class="qno">${qNo}</span></h3>
        </div>
        <div class="content">
          <div class="formulation clearfix">
            <div class="qtext">Pilih semua layer yang terdapat pada model TCP/IP standard:</div>
            <div class="prompt">Pilih satu atau lebih:</div>
            <div class="answer">
              <div class="r0"><input type="checkbox" name="q${qNo}:cb0" value="val_app" id="q${qNo}_cb0"><label for="q${qNo}_cb0">Application Layer</label></div>
              <div class="r1"><input type="checkbox" name="q${qNo}:cb1" value="val_trans" id="q${qNo}_cb1"><label for="q${qNo}_cb1">Transport Layer</label></div>
              <div class="r0"><input type="checkbox" name="q${qNo}:cb2" value="val_pres" id="q${qNo}_cb2"><label for="q${qNo}_cb2">Presentation Layer</label></div>
              <div class="r1"><input type="checkbox" name="q${qNo}:cb3" value="val_inet" id="q${qNo}_cb3"><label for="q${qNo}_cb3">Internet Layer</label></div>
            </div>
          </div>
        </div>
      </div>
      <div class="submitbtns">
        <input type="submit" name="next" value="Halaman selanjutnya" class="btn btn-primary">
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function createMatchingPageHtml(qNo = 3): string {
  return `<!DOCTYPE html>
<html>
<head><title>Moodle Quiz Attempt - Matching</title></head>
<body>
  <div id="page">
    <div id="quiz-timer" class="mod_quiz-timer-wrapper">Time left 00:25:00</div>
    <form id="responseform">
      <div id="q${qNo}" class="que match deferredfeedback notyetanswered">
        <div class="info">
          <h3 class="no">Question <span class="qno">${qNo}</span></h3>
        </div>
        <div class="content">
          <div class="formulation clearfix">
            <div class="qtext">Match each network device with its primary operating layer:</div>
            <table class="answer">
              <tbody>
                <tr class="r0">
                  <td class="text">[DEV-SWITCH] Managed Ethernet Switch</td>
                  <td class="control">
                    <select name="q${qNo}:sub0" id="menuq${qNo}_sub0" class="select custom-select">
                      <option value="0">Choose...</option>
                      <option value="layer1">Layer 1 - Physical</option>
                      <option value="layer2">Layer 2 - Data Link</option>
                      <option value="layer3">Layer 3 - Network</option>
                    </select>
                  </td>
                </tr>
                <tr class="r1">
                  <td class="text">[DEV-ROUTER] IP Router</td>
                  <td class="control">
                    <select name="q${qNo}:sub1" id="menuq${qNo}_sub1" class="select custom-select">
                      <option value="0">Choose...</option>
                      <option value="layer1">Layer 1 - Physical</option>
                      <option value="layer2">Layer 2 - Data Link</option>
                      <option value="layer3">Layer 3 - Network</option>
                    </select>
                  </td>
                </tr>
                <tr class="r0">
                  <td class="text">[DEV-HUB] Passive Ethernet Hub</td>
                  <td class="control">
                    <select name="q${qNo}:sub2" id="menuq${qNo}_sub2" class="select custom-select">
                      <option value="0">Choose...</option>
                      <option value="layer1">Layer 1 - Physical</option>
                      <option value="layer2">Layer 2 - Data Link</option>
                      <option value="layer3">Layer 3 - Network</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="submitbtns">
        <input type="submit" name="next" value="Next page" class="btn btn-primary">
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function createTrueFalsePageHtml(qNo = 4): string {
  return `<!DOCTYPE html>
<html>
<head><title>Moodle Quiz Attempt - True/False</title></head>
<body>
  <div id="page">
    <div id="quiz-timer">Time left 00:15:30</div>
    <form id="responseform">
      <div id="q${qNo}" class="que truefalse deferredfeedback notyetanswered">
        <div class="info">
          <h3 class="no">Question <span class="qno">${qNo}</span></h3>
        </div>
        <div class="content">
          <div class="formulation clearfix">
            <div class="qtext">UDP is a connection-oriented protocol that guarantees packet delivery.</div>
            <div class="answer">
              <div class="r0"><input type="radio" name="q${qNo}:1_answer" value="1" id="q${qNo}_tf_true"><label for="q${qNo}_tf_true">True</label></div>
              <div class="r1"><input type="radio" name="q${qNo}:1_answer" value="0" id="q${qNo}_tf_false"><label for="q${qNo}_tf_false">False</label></div>
            </div>
          </div>
        </div>
      </div>
      <div class="submitbtns">
        <input type="submit" name="next" value="Finish attempt..." class="btn btn-primary">
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function createSummaryPageHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><title>Summary of attempt</title></head>
<body>
  <div id="page">
    <h2>Summary of attempt</h2>
    <table class="generaltable">
      <thead><tr><th>Question</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Answer saved</td></tr>
        <tr><td>2</td><td>Answer saved</td></tr>
        <tr><td>3</td><td>Answer saved</td></tr>
        <tr><td>4</td><td>Answer saved</td></tr>
      </tbody>
    </table>
    <div class="submitbtns">
      <button class="btn btn-primary" id="submitallbtn">Submit all and finish</button>
    </div>
  </div>
</body>
</html>`;
}

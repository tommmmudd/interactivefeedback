
console.clear();
// use compressor here for dynamics
// https://riptutorial.com/web-audio

let audioContext = new (window.AudioContext || window.webkitAudioContext)();
reverbjs.extend(audioContext);


// osc --> ring mod A
// output --> limiter --> [reverb?] --> delay --> gain --> ring mod B



// SIMPLE DELAY CLASS - currently fixed max duration at 1000 samples..
// the point here is that it can have smoothed changes to the delay time - no clicks
class Delay
{
  constructor(context)
  {
  
    this.buffer = [];
    this.size = 5000;
    this.readPos = 0;
    this.writePos = 0;

    this.delayTimeInSamples = this.size;

    // for smoothing
    
    this.targetDelayTime = this.delayTimeInSamples;
    this.transitionTimeInSamples = 1500;
    this.transitionDelayTime = this.delayTimeInSamples;
    this.transitionCounter = this.transitionTimeInSamples; 


    for (let i=0; i<this.size; i++)
    {
      this.buffer[i] = 0.0;
    }

    this.processor = context.createScriptProcessor(256, 1, 1);
    let self = this;

    this.processor.onaudioprocess = function(audioProcessingEvent) {

      let inputBuffer = audioProcessingEvent.inputBuffer;
      let inputData = inputBuffer.getChannelData(0);

      let outputBuffer = audioProcessingEvent.outputBuffer;
      let outputData = outputBuffer.getChannelData(0);

      for (let i = 0; i < outputBuffer.length; i++) 
      {
        outputData[i] = self.process(inputData[i]);
      }
    }

  }

  readVal()
  {
      // get current value at readPos
      let outVal = this.linearInterpolation(); //this.buffer[this.readPos];
      // increment readPos
      this.readPos ++;
      
      if (this.readPos >= this.size)
          this.readPos = 0;
   
      return outVal;
  }

  linearInterpolation()
  {
      // get buffer index
      let indexA = Math.floor(this.readPos);
      let indexB = indexA + 1;
      
      // wrap
      if (indexB >= this.size)
          indexB -= this.size;
      
      let valA = this.buffer[indexA];
      let valB = this.buffer[indexB];
      
      let remainder = this.readPos - indexA;
      
      let interpolatedValue = (1-remainder)*valA  +  remainder*valB;
      
      return interpolatedValue;
      
  }

  writeVal(inputSample)
  {
      // store current value at writePos
      this.buffer[this.writePos] = inputSample;
      
      // increment writePos
      this.writePos ++;
      
      if (this.writePos >= this.size)
          this.writePos = 0;
  }

  process(inputSample)
  {

    if (this.transitionCounter < this.transitionTimeInSamples)
    {
      let newDelayTime = this.delayTimeInSamples + ((this.targetDelayTime - this.transitionDelayTime) / this.transitionTimeInSamples);
      this.setDelayTimeInSamples(newDelayTime)
      this.transitionCounter += 1;
    }

    let outVal = this.readVal(inputSample);
    this.writeVal(inputSample);
    return outVal;
  }

  setDelayTimeInSamples(newDelayTimeInSamples)
  {
    if (newDelayTimeInSamples > this.size)
        newDelayTimeInSamples = this.size;
    
    if (newDelayTimeInSamples < 1)
        newDelayTimeInSamples = 1;

    this.delayTimeInSamples = newDelayTimeInSamples;
    
    this.readPos = this.writePos - this.delayTimeInSamples;
    
    // if readPos < 0, then add size to readPos
    if (this.readPos < 0)
        this.readPos += this.size;
  }

  setDelayTimeInSamplesSmooth(newTime)  { this.targetDelayTime = newTime; this.transitionDelayTime = this.delayTimeInSamples; this.transitionCounter = 0; }

  get input() {
    return this.processor;
  }

  connect(node) {
    this.processor.connect(node);
  }
}




var EnvelopeGenerator = (function(context) {
  function EnvelopeGenerator() {
    this.attackTime = 0.001;
    this.releaseTime = 1.0;
  };

  EnvelopeGenerator.prototype.trigger = function() {
    //console.log("triggered!!");
    now = context.currentTime;
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(0, now);
    this.param.linearRampToValueAtTime(1, now + this.attackTime);
    this.param.linearRampToValueAtTime(0, now + this.attackTime + this.releaseTime);
  };

  EnvelopeGenerator.prototype.connect = function(param) {
    this.param = param;
  };

  return EnvelopeGenerator;
})(audioContext);

class VCA {
  constructor(context) 
  {
    let blocksize = 256;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
  }
  
  get gainVal() {     return this.gain.gain;  }
  get input()   {     return this.gain;        }

  connect(node) {    this.gain.connect(node);  }
};





//============================================================================
//============================================================================
// OBJECTS

// osc --> ring mod A
// output --> limiter --> [reverb?] --> delay --> gain --> ring mod B

let vca = new VCA(audioContext);
var envelope = new EnvelopeGenerator;


let ringMod = audioContext.createGain(); //new RingMod(audioContext);

var osc = audioContext.createOscillator();
osc.frequency.value = 220;
osc.start();

var starterOsc = audioContext.createOscillator();
starterOsc.frequency.value = 220;
starterOsc.start();

var delay = new Delay(audioContext);
delay.setDelayTimeInSamples(150);

//var delay = audioContext.createDelay(1.0);   // max delay time is 0.1 seconds
//delay.delayTime.value = 0.15; // set to 150 milliseconds


let feedbackGain = audioContext.createGain();
feedbackGain.gain.value = 1.1;


const compressor = audioContext.createDynamicsCompressor();
compressor.threshold.setValueAtTime(-20, audioContext.currentTime);
compressor.knee.setValueAtTime(2, audioContext.currentTime);
compressor.ratio.setValueAtTime(5, audioContext.currentTime);
compressor.attack.setValueAtTime(0.01, audioContext.currentTime);
compressor.release.setValueAtTime(0.25, audioContext.currentTime);

let reverbGain = audioContext.createGain();
reverbGain.gain.value = 0.25;

let masterGain = audioContext.createGain();
masterGain.gain.value = 0.25;


let reverbUrl = "http://reverbjs.org/Library/AbernyteGrainSilo.m4a";
let reverb = audioContext.createReverbFromUrl(reverbUrl, function() {
  reverb.connect(reverbGain);
  //reverb.connect(feedbackGenerator.input);
});





//============================================================================
// ROUTING

// osc --> ring mod A
// output --> limiter --> [reverb?] --> delay --> feedbackGain --> ring mod B
// white noise --> vca --> limiter
// delay --> masterGain --> output destination

// noise impulse (triggered when audio is turned on)
//whiteNoise.connect(vca.input);
starterOsc.connect(vca.input)
envelope.connect(vca.gainVal);
vca.connect(feedbackGain);

// ring mod channels: osc * feedback
osc.connect(ringMod.gain);
feedbackGain.connect(ringMod);
ringMod.connect(compressor);

compressor.connect(delay.input);

compressor.connect(reverb);
// reverb.connect(reverbGain);    // already done above
reverbGain.connect(delay.input);

delay.connect(feedbackGain);

// output
delay.connect(masterGain);

// feedback node

// reverbGain.connect(masterGain);

// output to context
masterGain.connect(audioContext.destination)






//============================================================
// INTERFACE


// TRIGGER BUTTON
/*
const envButton = document.querySelector(".env-trig");
envButton.onmousedown = function() { envelope.trigger(); console.log("pressed"); }
envButton.onmouseup = function() { console.log("released"); }
*/


// JQUERY Range2DSlider

$('#slider').range2DSlider({
  grid:true,
  axis:[[0, 2, 4, 6, 8, 10],[0, 2, 4, 6, 8, 10]],
  projections:true,
  height:'500px',
  width:'500px',
  showLegend:[0,0],
  allowAxisMove:['both'],
  /*printLabel:function( val ){
    this.projections&&this.projections[0].find('.xdsoft_projection_value_x').text(val[1].toFixed(5));
    return val[0].toFixed(2) + ", " + val[1].toFixed(2);
  }*/
  printLabel:function( val )
  {
    let x = val[0] * 0.1;
    var newOscFreq = Math.floor((x * x) * 300) + 120;
    osc.frequency.value = newOscFreq;

    //feedbackGenerator.setDelayTime2 (newDelayTime2)

    let y = val[1] * 0.1;
    var newDelayTime = ((y * y) * 0.99) + 0.01;
    delay.setDelayTimeInSamplesSmooth(newDelayTime * 2205);

    //console.log(newDelayTime * 22050);

    this.projections&&this.projections[0].find('.xdsoft_projection_value_x').text(val[1].toFixed(5));
    return val[0].toFixed(2) + ", " + val[1].toFixed(2);
  }
}).range2DSlider('value',[[2.5,7.5]]);

$('#slider').range2DSlider();







// POWER BUTTON
const powerButton = document.querySelector(".control-power");

if (powerButton)
{
  console.log("power button exists");
  powerButton.addEventListener('click', function() {
  if (this.dataset.power === 'on') {
    audioContext.suspend();
    this.dataset.power = 'off';
    console.log("switching off");
    powerButton.innerHTML = "Turn Audio On";
    powerButton.style.background = "#CF9CB0";
  } else if (this.dataset.power === 'off') {
    audioContext.resume();
    this.dataset.power = 'on';
    envelope.trigger();
    console.log("switching on");
    powerButton.innerHTML = "Turn Audio Off";
    powerButton.style.background = "#4CCF90";

  }
  this.setAttribute( "aria-checked", audioContext.state ? "false" : "true" );
  console.log(audioContext.state);
}, false);
}
else 
{
  console.log("power button dunt exist yet");
}

function switchOn() 
{
	audioContext.resume();
}


//============================================================
// DRAWING ANALYSER

var analyser = audioContext.createAnalyser();
masterGain.connect(analyser);
analyser.fftSize = 4096;
var bufferLength = analyser.frequencyBinCount;
var bufferToUse = bufferLength/6
console.log(bufferLength);
var dataArray = new Uint8Array(bufferToUse);

var canvas = document.querySelector('.visualizer');
var canvasCtx = canvas.getContext("2d");


//canvasCtx.fillStyle = 'rgb(200, 100, 50)';
//canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
function draw() {

  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = 'rgb(239, 239, 239)';//  - this is #efefef?
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var barWidth = (canvas.width / bufferToUse) * 1.5;
  var barHeight;
  var x = 0;
  for(var i = 0; i < bufferToUse; i++) 
  {
    barHeight = dataArray[i]/2;
    barHeight = barHeight / 150.0;
    barHeight *= barHeight*barHeight;
    barHeight *= 75

    canvasCtx.fillStyle = 'rgb(50,50,'+(barHeight+50)+')';
    canvasCtx.fillRect(x, canvas.height - barHeight/2, barWidth, barHeight);

    x += barWidth;
  }
};

draw();

